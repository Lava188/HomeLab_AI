const {
    extractTextFromPdfBuffer
} = require("../services/lab-result/lab-result-extract.service");
const {
    parseLabResultsFromText
} = require("../services/lab-result/lab-result-parser.service");
const {
    buildProfessionalSummary
} = require("../services/lab-result/lab-result-interpretation.service");

const MIN_EXTRACTABLE_TEXT_LENGTH = 12;

async function interpretLabResultPdf(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                code: "LAB_RESULT_FILE_REQUIRED",
                message: "Form-data field 'file' is required and must be a PDF."
            });
        }

        if (req.file.mimetype !== "application/pdf") {
            return res.status(400).json({
                success: false,
                code: "LAB_RESULT_PDF_ONLY",
                message: "Only PDF lab result uploads are supported in this step."
            });
        }

        let extraction;

        try {
            extraction = await extractTextFromPdfBuffer(req.file.buffer);
        } catch (error) {
            return res.status(400).json({
                success: false,
                code: "LAB_RESULT_PDF_EXTRACTION_FAILED",
                message: "Could not extract readable text from the uploaded PDF."
            });
        }

        if (
            !extraction.extractedText ||
            extraction.extractedText.replace(/\s+/g, "").length < MIN_EXTRACTABLE_TEXT_LENGTH
        ) {
            return res.status(400).json({
                success: false,
                code: "LAB_RESULT_NO_EXTRACTABLE_TEXT",
                message: "Không đọc được text từ PDF. File có thể là bản scan/ảnh hoặc không có lớp text extractable."
            });
        }

        const parsedItems = parseLabResultsFromText(extraction.extractedText);
        const professionalSummary = buildProfessionalSummary(
            parsedItems,
            extraction.extractedText
        );

        return res.status(200).json({
            success: true,
            data: {
                file: {
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                },
                extraction: {
                    pageCount: extraction.pageCount,
                    extractedTextPreview: extraction.extractedTextPreview
                },
                parsedItems,
                professionalSummary,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    interpretLabResultPdf
};
