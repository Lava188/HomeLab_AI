const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(
    __dirname,
    "../../../../ai_lab/datasets/package_catalog_v1.json"
);

let catalogCache = null;

function loadPackageCatalog() {
    if (catalogCache) {
        return catalogCache;
    }

    const rawCatalog = fs.readFileSync(CATALOG_PATH, "utf8");
    const catalog = JSON.parse(rawCatalog);
    const packages = Array.isArray(catalog.packages) ? catalog.packages : [];

    catalogCache = {
        catalog,
        catalogVersion: catalog.catalog_version || null,
        catalogRuntimeEnabled: Boolean(catalog.runtime_enabled),
        packages,
        packageById: new Map(
            packages.map((item) => [item.package_id, item])
        )
    };

    return catalogCache;
}

function summarizePackage(packageItem) {
    if (!packageItem) {
        return null;
    }

    return {
        packageId: packageItem.package_id || null,
        displayName: packageItem.display_name || packageItem.package_name || null,
        displayNameVi: packageItem.display_name_vi || null,
        includedTests: Array.isArray(packageItem.included_tests)
            ? packageItem.included_tests
            : [],
        evidenceStatus: packageItem.evidence_status || null,
        supportedSources: Array.isArray(packageItem.supported_sources)
            ? packageItem.supported_sources
            : [],
        interpretationBoundary: packageItem.interpretation_boundary || null
    };
}

function getPackageRuntimeGate(packageItem) {
    if (!packageItem) {
        return {
            runtimeAllowed: false,
            recommendationExposure: "missing",
            packageStatus: "missing",
            needsManualReview: true
        };
    }

    return {
        runtimeAllowed: Boolean(packageItem.runtime_allowed),
        recommendationExposure: packageItem.recommendation_exposure || null,
        packageStatus: packageItem.package_status || null,
        needsManualReview: Boolean(packageItem.needs_manual_review)
    };
}

module.exports = {
    loadPackageCatalog,
    summarizePackage,
    getPackageRuntimeGate
};
