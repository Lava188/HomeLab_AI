const { spawn } = require("child_process");
const { execFileSync } = require("child_process");
const path = require("path");
const { parseLabResultsFromText } = require("../src/services/lab-result/lab-result-parser.service");

const PORT = process.env.HOMELAB_SMOKE_PORT || "5179";
const API_BASE_URL = `http://localhost:${PORT}`;
const BACKEND_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "../..");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function pdfEscape(text) {
    return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createTextPdf(lines) {
    const textCommands = lines
        .map((line, index) => `BT /F1 11 Tf 50 ${760 - index * 18} Td (${pdfEscape(line)}) Tj ET`)
        .join("\n");
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(textCommands, "latin1")} >>\nstream\n${textCommands}\nendstream`
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, "latin1"));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, "latin1");
}

const samplePdf = createTextPdf([
    "HomeLab sample lab result",
    "WBC 12.5 x10^9/L 4.0 - 10.0",
    "HGB 14.2 g/dL 13.0 - 17.0",
    "ALT 85 U/L reference 0 - 40",
    "AST 72 U/L reference 0 - 40",
    "Creatinine 1.4 mg/dL 0.7 - 1.3",
    "HbA1c 5.8 %",
    "Cholesterol 180 mg/dL 120 - 200"
]);
const blankPdf = createTextPdf([]);
const hba1cOnlyPdf = createTextPdf([
    "HomeLab sample lab result",
    "HbA1c 6.2 % 4.0 - 5.6"
]);
const hbOnlyPdf = createTextPdf([
    "HomeLab sample lab result",
    "Hb 135 g/L 120 - 160"
]);
const normalOnlyPdf = createTextPdf([
    "HomeLab sample lab result",
    "HGB 14.2 g/dL 13.0 - 17.0",
    "WBC 7.2 x10^9/L 4.0 - 10.0"
]);

async function waitForServer() {
    const deadline = Date.now() + 12000;
    let lastError = null;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/health`);
            if (response.ok) {
                return;
            }
        } catch (error) {
            lastError = error;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Server did not become ready: ${lastError?.message || "timeout"}`);
}

async function postForm(form) {
    const response = await fetch(`${API_BASE_URL}/api/lab-results/interpret`, {
        method: "POST",
        body: form
    });
    const payload = await response.json();

    return {
        response,
        payload
    };
}

async function interpretSamplePdf() {
    return interpretPdfBuffer(samplePdf, "lab_result_sample_5i.pdf");
}

async function interpretPdfBuffer(buffer, filename) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);

    return postForm(form);
}

function findItem(payload, code) {
    return payload.data?.parsedItems?.find((item) => item.code === code);
}

async function runCase(id, fn, state) {
    try {
        await fn(state);
        console.log(`PASS ${id}`);
        return { id, passed: true };
    } catch (error) {
        console.error(`FAIL ${id}: ${error.message}`);
        return { id, passed: false };
    }
}

function assertNoDiagnosisLanguage(payload) {
    const serialized = JSON.stringify(payload).toLowerCase();
    const bannedPatterns = [
        /bạn bị/,
        /ban bi/,
        /you have/,
        /suy thận/,
        /suy than/,
        /ung thư/,
        /ung thu/,
        /viêm gan/,
        /viem gan/
    ];

    for (const pattern of bannedPatterns) {
        assert(!pattern.test(serialized), `diagnosis-like language found: ${pattern}`);
    }
}

function assertScopeUntouched() {
    const output = execFileSync("git", ["diff", "--name-only"], {
        cwd: REPO_ROOT,
        encoding: "utf8"
    });
    const changedFiles = output.split(/\r?\n/).filter(Boolean);
    const forbidden = changedFiles.filter((file) =>
        [
            /^backend\/prisma\/schema\.prisma$/,
            /booking/i,
            /collector/i,
            /rag/i,
            /retriever/i,
            /payment/i
        ].some((pattern) => pattern.test(file.replace(/\\/g, "/")))
    );

    assert(forbidden.length === 0, `unexpected scoped files changed: ${forbidden.join(", ")}`);
}

async function main() {
    const server = spawn("node", ["src/app.js"], {
        cwd: BACKEND_DIR,
        env: {
            ...process.env,
            PORT
        },
        stdio: ["ignore", "pipe", "pipe"]
    });

    let serverOutput = "";
    server.stdout.on("data", (chunk) => {
        serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
        serverOutput += chunk.toString();
    });

    const state = {
        sample: null
    };

    try {
        await waitForServer();

        const cases = [
            [
                "reject_missing_file",
                async () => {
                    const { response, payload } = await postForm(new FormData());
                    assert(response.status === 400, "missing file did not return 400");
                    assert(payload.success === false, "missing file response was not controlled");
                    assert(payload.code === "LAB_RESULT_FILE_REQUIRED", "missing file code mismatch");
                }
            ],
            [
                "reject_non_pdf",
                async () => {
                    const form = new FormData();
                    form.append("file", new Blob(["not a pdf"], { type: "text/plain" }), "lab.txt");
                    const { response, payload } = await postForm(form);

                    assert(response.status === 400, "non-pdf did not return 400");
                    assert(payload.success === false, "non-pdf response was not controlled");
                    assert(payload.code === "LAB_RESULT_PDF_ONLY", "non-pdf code mismatch");
                }
            ],
            [
                "pdf_without_extractable_text_returns_controlled_error",
                async () => {
                    const { response, payload } = await interpretPdfBuffer(blankPdf, "blank_scan_like_5i.pdf");

                    assert(response.status === 400, "blank PDF did not return 400");
                    assert(payload.success === false, "blank PDF response was not controlled");
                    assert(payload.code === "LAB_RESULT_NO_EXTRACTABLE_TEXT", "blank PDF code mismatch");
                    assert(/scan|ảnh|extractable/i.test(payload.message), "blank PDF message was not clear");
                }
            ],
            [
                "interpret_sample_pdf",
                async () => {
                    state.sample = await interpretSamplePdf();
                    assert(state.sample.response.status === 200, "sample PDF endpoint failed");
                    assert(state.sample.payload.success === true, "sample PDF response was not successful");
                }
            ],
            [
                "parse_cbc_wbc_high_hgb_normal",
                async () => {
                    const wbc = findItem(state.sample.payload, "WBC");
                    const hgb = findItem(state.sample.payload, "HGB");

                    assert(wbc?.flag === "HIGH", "WBC was not parsed as HIGH");
                    assert(wbc.value === 12.5 && wbc.referenceHigh === 10, "WBC value/reference mismatch");
                    assert(hgb?.flag === "NORMAL", "HGB was not parsed as NORMAL");
                }
            ],
            [
                "parse_liver_alt_ast_high",
                async () => {
                    const alt = findItem(state.sample.payload, "ALT");
                    const ast = findItem(state.sample.payload, "AST");

                    assert(alt?.flag === "HIGH", "ALT was not parsed as HIGH");
                    assert(ast?.flag === "HIGH", "AST was not parsed as HIGH");
                }
            ],
            [
                "parse_kidney_creatinine_with_reference",
                async () => {
                    const creatinine = findItem(state.sample.payload, "CREATININE");

                    assert(creatinine, "Creatinine was not parsed");
                    assert(creatinine.referenceLow === 0.7, "Creatinine referenceLow mismatch");
                    assert(creatinine.referenceHigh === 1.3, "Creatinine referenceHigh mismatch");
                    assert(creatinine.flag === "HIGH", "Creatinine flag mismatch");
                }
            ],
            [
                "unknown_when_reference_missing",
                async () => {
                    const hba1c = findItem(state.sample.payload, "HBA1C");

                    assert(hba1c, "HbA1c was not parsed");
                    assert(hba1c.flag === "UNKNOWN", "HbA1c without reference was not UNKNOWN");
                    assert(hba1c.severity === "UNKNOWN", "HbA1c severity mismatch");
                }
            ],
            [
                "hba1c_not_misparsed_as_hgb",
                async () => {
                    const result = await interpretPdfBuffer(hba1cOnlyPdf, "hba1c_only_5i.pdf");
                    const hba1c = findItem(result.payload, "HBA1C");
                    const hgb = findItem(result.payload, "HGB");

                    assert(result.response.status === 200, "HbA1c-only PDF endpoint failed");
                    assert(hba1c, "HbA1c was not parsed");
                    assert(hba1c.value === 6.2, "HbA1c value mismatch");
                    assert(hba1c.flag === "HIGH", "HbA1c flag mismatch");
                    assert(!hgb, "HbA1c was misparsed as HGB");
                }
            ],
            [
                "hgb_hb_still_parses_when_line_is_hb_135_g_l_120_160",
                async () => {
                    const result = await interpretPdfBuffer(hbOnlyPdf, "hb_only_5i.pdf");
                    const hgb = findItem(result.payload, "HGB");
                    const hba1c = findItem(result.payload, "HBA1C");

                    assert(result.response.status === 200, "Hb-only PDF endpoint failed");
                    assert(hgb, "Hb line was not parsed as HGB");
                    assert(hgb.value === 135, "Hb/HGB value mismatch");
                    assert(hgb.unit === "g/L", "Hb/HGB unit mismatch");
                    assert(hgb.flag === "NORMAL", "Hb/HGB flag mismatch");
                    assert(!hba1c, "Hb line was misparsed as HbA1c");
                }
            ],
            [
                "tg_sample_time_not_parsed_as_triglyceride",
                async () => {
                    const metadataItems = parseLabResultsFromText(
                        "TG lấy mẫu: 11:20 04/05/2026 Người lấy mẫu: Trần Thị Hạnh"
                    );
                    const realTriglyceride = parseLabResultsFromText(
                        "TG 2.5 mmol/L 0.4 - 1.7"
                    );

                    assert(
                        !metadataItems.some((item) => item.code === "TRIGLYCERIDE"),
                        "sample time metadata was parsed as TRIGLYCERIDE"
                    );
                    assert(
                        realTriglyceride.some((item) => item.code === "TRIGLYCERIDE" && item.value === 2.5),
                        "real TG lipid result no longer parses"
                    );
                }
            ],
            [
                "conclusion_present_when_normal",
                async () => {
                    const result = await interpretPdfBuffer(normalOnlyPdf, "normal_only_5i.pdf");
                    const conclusion = result.payload.data?.professionalSummary?.conclusionVi || "";

                    assert(result.response.status === 200, "normal-only PDF endpoint failed");
                    assert(conclusion, "conclusionVi missing for normal result");
                    assert(
                        conclusion.includes("nằm trong khoảng tham chiếu"),
                        "normal conclusion did not mention reference range"
                    );
                }
            ],
            [
                "conclusion_lists_abnormal_items",
                async () => {
                    const conclusion = state.sample.payload.data?.professionalSummary?.conclusionVi || "";

                    assert(conclusion, "conclusionVi missing for abnormal sample");
                    assert(conclusion.includes("ALT") && conclusion.includes("AST"), "abnormal conclusion did not list ALT and AST");
                    assert(
                        conclusion.includes("cao hơn khoảng tham chiếu"),
                        "abnormal conclusion did not describe high direction"
                    );
                }
            ],
            [
                "conclusion_does_not_diagnose",
                async () => {
                    const conclusion = state.sample.payload.data?.professionalSummary?.conclusionVi || "";

                    assert(conclusion, "conclusionVi missing");
                    assertNoDiagnosisLanguage({ conclusion });
                    assert(!/bạn bị|bệnh gan|suy thận|ung thư máu|sức khỏe tốt|sức khỏe xấu/i.test(conclusion), "conclusion used diagnosis-like or absolute health language");
                }
            ],
            [
                "professional_summary_has_overview",
                async () => {
                    const summary = state.sample.payload.data?.professionalSummary;

                    assert(summary?.overviewVi, "overviewVi missing");
                    assert(Array.isArray(summary.groupSummaries), "groupSummaries missing");
                    assert(Array.isArray(summary.itemInterpretations), "itemInterpretations missing");
                    assert(summary.safetyNotes?.some((note) => note.includes("không chẩn đoán bệnh")), "disclaimer missing");
                }
            ],
            [
                "no_diagnosis_language",
                async () => {
                    assertNoDiagnosisLanguage(state.sample.payload);
                }
            ],
            [
                "evidence_text_present",
                async () => {
                    const items = state.sample.payload.data?.parsedItems || [];

                    assert(items.length > 0, "no parsed items");
                    assert(items.every((item) => item.evidenceText), "some parsed items are missing evidenceText");
                }
            ],
            [
                "does_not_touch_booking_or_collector",
                async () => {
                    assertScopeUntouched();
                }
            ]
        ];

        const results = [];
        for (const [id, fn] of cases) {
            results.push(await runCase(id, fn, state));
        }

        const passed = results.filter((result) => result.passed).length;
        const failed = results.length - passed;

        console.log(`TOTAL ${results.length} PASSED ${passed} FAILED ${failed}`);

        if (failed > 0) {
            process.exitCode = 1;
        }
    } finally {
        server.kill();
        if (process.exitCode) {
            console.error(serverOutput);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
