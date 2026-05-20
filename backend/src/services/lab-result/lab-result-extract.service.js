const { PDFParse } = require("pdf-parse");

const MAX_PREVIEW_LENGTH = 1200;

function buildPreview(text) {
    const normalized = String(text || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (normalized.length <= MAX_PREVIEW_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, MAX_PREVIEW_LENGTH).trim()}...`;
}

async function extractTextFromPdfBuffer(buffer) {
    const parser = new PDFParse({ data: buffer });

    try {
        const result = await parser.getText({
            lineEnforce: true,
            cellSeparator: " "
        });
        const extractedText = String(result.text || "").trim();

        return {
            extractedText,
            extractedTextPreview: buildPreview(extractedText),
            pageCount: result.total || null
        };
    } finally {
        await parser.destroy();
    }
}

module.exports = {
    extractTextFromPdfBuffer,
    buildPreview
};
