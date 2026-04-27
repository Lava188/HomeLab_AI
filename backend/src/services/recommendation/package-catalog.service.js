const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(
    __dirname,
    "../../../../ai_lab/datasets/package_catalog_v1.json"
);

let catalogCache = null;

const DISPLAY_NAME_VI_OVERRIDES = {
    pkg_anemia_infection_basic_v1:
        "Gói sàng lọc cơ bản thiếu máu / nhiễm trùng",
    pkg_diabetes_glucose_basic_v1: "Gói sàng lọc cơ bản đường huyết",
    pkg_lipid_cardiometabolic_basic_v1: "Gói sàng lọc cơ bản mỡ máu",
    pkg_liver_function_metabolic_basic_v1:
        "Gói sàng lọc cơ bản gan / chuyển hóa",
    pkg_kidney_function_basic_v1: "Gói sàng lọc cơ bản chức năng thận",
    pkg_infectious_screening_hbv_hiv_v1:
        "Gói sàng lọc cơ bản nhiễm trùng HBV/HIV"
};

const INCLUDED_TESTS_VI_OVERRIDES = {
    pkg_anemia_infection_basic_v1: ["Công thức máu toàn bộ (CBC)"],
    pkg_diabetes_glucose_basic_v1: ["Đường huyết"],
    pkg_lipid_cardiometabolic_basic_v1: ["Mỡ máu"],
    pkg_kidney_function_basic_v1: ["Bảng chuyển hóa cơ bản (BMP)"]
};

const TEST_GROUP_DISPLAY_VI_OVERRIDES = {
    cbc: "Công thức máu toàn bộ (CBC)",
    blood_glucose: "Đường huyết",
    lipid_profile: "Mỡ máu",
    bmp: "Bảng chuyển hóa cơ bản (BMP)"
};

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
        id: packageItem.package_id || null,
        packageId: packageItem.package_id || null,
        displayName: packageItem.display_name || packageItem.package_name || null,
        displayNameVi:
            DISPLAY_NAME_VI_OVERRIDES[packageItem.package_id] ||
            packageItem.display_name_vi ||
            null,
        category: packageItem.internal_name || packageItem.goal || null,
        domain: "lab_test_package",
        includedTests:
            INCLUDED_TESTS_VI_OVERRIDES[packageItem.package_id] ||
            (Array.isArray(packageItem.included_tests)
                ? packageItem.included_tests
                : []),
        testGroups: Array.isArray(packageItem.recommended_tests)
            ? packageItem.recommended_tests.map((test) => ({
                ...test,
                display_name:
                    TEST_GROUP_DISPLAY_VI_OVERRIDES[test.test_code] ||
                    test.display_name
            }))
            : [],
        evidenceStatus: packageItem.evidence_status || null,
        sourceRefs: Array.isArray(packageItem.supported_sources)
            ? packageItem.supported_sources
            : [],
        sourceLabels: Array.isArray(packageItem.supported_sources)
            ? packageItem.supported_sources
            : [],
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
