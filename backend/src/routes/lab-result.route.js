const express = require("express");
const multer = require("multer");

const labResultController = require("../controllers/lab-result.controller");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== "application/pdf") {
            const error = new Error("Only PDF uploads are supported.");
            error.code = "LAB_RESULT_PDF_ONLY";
            cb(error);
            return;
        }

        cb(null, true);
    }
});

function handleUpload(req, res, next) {
    upload.single("file")(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                code: "LAB_RESULT_FILE_TOO_LARGE",
                message: "PDF file is too large. Maximum supported size is 8 MB."
            });
        }

        if (error.code === "LAB_RESULT_PDF_ONLY") {
            return res.status(400).json({
                success: false,
                code: "LAB_RESULT_PDF_ONLY",
                message: "Only PDF lab result uploads are supported in this step."
            });
        }

        next(error);
    });
}

router.post("/interpret", handleUpload, labResultController.interpretLabResultPdf);

module.exports = router;
