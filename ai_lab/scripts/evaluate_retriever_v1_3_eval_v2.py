from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

import faiss
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[2]
AI_LAB = ROOT / "ai_lab"
ARTIFACT_DIR = AI_LAB / "artifacts" / "retriever_v1_3"
REPORTS_DIR = AI_LAB / "reports"

MANIFEST_PATH = ARTIFACT_DIR / "retriever_manifest.json"
CONFIG_PATH = ARTIFACT_DIR / "embedding_config.json"
JSON_REPORT_PATH = REPORTS_DIR / "retriever_v1_3_eval_v2_report.json"
MD_REPORT_PATH = REPORTS_DIR / "retriever_v1_3_eval_v2_report.md"


EVAL_CASES: list[dict[str, Any]] = [
    {
        "id": "v2_abdomen_001",
        "group": "dau_bung",
        "query": "đau bụng dữ dội kèm nôn ra máu có cần đi cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_035_c1"],
        "expected_source_ids": ["nhs_stomach_ache"],
        "expected_keywords": ["đau bụng", "nôn ra máu", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_abdomen_002",
        "group": "dau_bung",
        "query": "đi ngoài phân đen và đau bụng nhiều thì nên làm gì",
        "expected_chunk_ids": ["kb_v1_2_035_c1"],
        "expected_source_ids": ["nhs_stomach_ache"],
        "expected_keywords": ["phân đen", "đau bụng", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_abdomen_003",
        "group": "dau_bung",
        "query": "đau bụng kéo dài tái diễn kèm sốt có nên đi khám sớm không",
        "expected_chunk_ids": ["kb_v1_2_036_c1"],
        "expected_source_ids": ["nhs_stomach_ache"],
        "expected_keywords": ["đau bụng kéo dài", "tái diễn", "sốt"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_abdomen_004",
        "group": "dau_bung",
        "query": "bụng đau âm ỉ nhiều ngày rồi lại sốt nhẹ tôi cần được tư vấn gì",
        "expected_chunk_ids": ["kb_v1_2_036_c1"],
        "expected_source_ids": ["nhs_stomach_ache"],
        "expected_keywords": ["đau bụng", "kéo dài", "khám sớm"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_abdomen_005",
        "group": "dau_bung",
        "query": "đau bụng nhưng chưa rõ vị trí và không biết có nguy hiểm không",
        "expected_chunk_ids": ["kb_v1_2_035_c1", "kb_v1_2_036_c1"],
        "expected_source_ids": ["nhs_stomach_ache"],
        "expected_keywords": ["đau bụng", "cấp cứu", "khám sớm"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_headache_001",
        "group": "dau_dau",
        "query": "đau đầu dữ dội đột ngột kèm nói khó có phải dấu hiệu cần cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_033_c1"],
        "expected_source_ids": ["nhs_headaches"],
        "expected_keywords": ["đau đầu dữ dội", "đột ngột", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_headache_002",
        "group": "dau_dau",
        "query": "đau đầu kèm yếu một bên tay chân thì nên làm gì",
        "expected_chunk_ids": ["kb_v1_2_033_c1"],
        "expected_source_ids": ["nhs_headaches"],
        "expected_keywords": ["đau đầu", "thần kinh", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_headache_003",
        "group": "dau_dau",
        "query": "đau đầu kéo dài tái diễn và buồn nôn có cần khám bác sĩ không",
        "expected_chunk_ids": ["kb_v1_2_034_c1"],
        "expected_source_ids": ["nhs_headaches"],
        "expected_keywords": ["đau đầu kéo dài", "tái diễn", "nôn"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_headache_004",
        "group": "dau_dau",
        "query": "nhức đầu nhiều ngày không hết tôi có nên đi kiểm tra sớm",
        "expected_chunk_ids": ["kb_v1_2_034_c1"],
        "expected_source_ids": ["nhs_headaches"],
        "expected_keywords": ["đau đầu kéo dài", "khám sớm"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_headache_005",
        "group": "dau_dau",
        "query": "tự nhiên đau đầu như sét đánh và chóng mặt",
        "expected_chunk_ids": ["kb_v1_2_033_c1"],
        "expected_source_ids": ["nhs_headaches"],
        "expected_keywords": ["đau đầu dữ dội", "đột ngột", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_fainting_001",
        "group": "ngat_xiu",
        "query": "bị ngất kèm đau ngực và khó thở có cần gọi cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_031_c1"],
        "expected_source_ids": ["nhs_fainting_adults"],
        "expected_keywords": ["ngất", "đau ngực", "khó thở"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_fainting_002",
        "group": "ngat_xiu",
        "query": "xỉu rồi bị chấn thương đầu thì xử trí thế nào",
        "expected_chunk_ids": ["kb_v1_2_031_c1"],
        "expected_source_ids": ["nhs_fainting_adults"],
        "expected_keywords": ["ngất", "chấn thương", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_fainting_003",
        "group": "ngat_xiu",
        "query": "ngất tái diễn nhưng chưa biết nguyên nhân có nên đi khám không",
        "expected_chunk_ids": ["kb_v1_2_032_c1"],
        "expected_source_ids": ["nhs_fainting_adults"],
        "expected_keywords": ["ngất tái diễn", "chưa rõ nguyên nhân", "đánh giá y tế"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_fainting_004",
        "group": "ngat_xiu",
        "query": "thi thoảng bị choáng rồi ngã quỵ có cần kiểm tra không",
        "expected_chunk_ids": ["kb_v1_2_032_c1"],
        "expected_source_ids": ["nhs_fainting_adults"],
        "expected_keywords": ["ngất", "tái diễn", "đánh giá y tế"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_fainting_005",
        "group": "ngat_xiu",
        "query": "vừa ngất xong lại thấy khó thở và tức ngực",
        "expected_chunk_ids": ["kb_v1_2_031_c1"],
        "expected_source_ids": ["nhs_fainting_adults"],
        "expected_keywords": ["ngất", "khó thở", "đau ngực"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_anaphylaxis_001",
        "group": "di_ung_nang_phan_ve",
        "query": "dị ứng nặng sưng môi khó thở cần gọi cấp cứu không",
        "expected_chunk_ids": ["kb_v1_2_029_c1"],
        "expected_source_ids": ["nhs_anaphylaxis"],
        "expected_keywords": ["phản vệ", "dị ứng nặng", "khó thở"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_anaphylaxis_002",
        "group": "di_ung_nang_phan_ve",
        "query": "phản vệ nổi mẩn ngứa chóng mặt thở khó xử trí thế nào",
        "expected_chunk_ids": ["kb_v1_2_029_c1"],
        "expected_source_ids": ["nhs_anaphylaxis"],
        "expected_keywords": ["phản vệ", "cấp cứu", "khó thở"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_anaphylaxis_003",
        "group": "di_ung_nang_phan_ve",
        "query": "có bút tiêm adrenaline khi phản vệ thì dùng xong có cần đi viện không",
        "expected_chunk_ids": ["kb_v1_2_030_c1"],
        "expected_source_ids": ["nhs_anaphylaxis"],
        "expected_keywords": ["adrenaline", "phản vệ", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_anaphylaxis_004",
        "group": "di_ung_nang_phan_ve",
        "query": "sau khi tiêm adrenaline triệu chứng đỡ hơn có thể ở nhà theo dõi không",
        "expected_chunk_ids": ["kb_v1_2_030_c1"],
        "expected_source_ids": ["nhs_anaphylaxis"],
        "expected_keywords": ["adrenaline", "vẫn đi cấp cứu", "phản vệ"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_anaphylaxis_005",
        "group": "di_ung_nang_phan_ve",
        "query": "ăn hải sản xong sưng họng khó thở tôi nên hỏi xét nghiệm hay đi cấp cứu",
        "expected_chunk_ids": ["kb_v1_2_029_c1"],
        "expected_source_ids": ["nhs_anaphylaxis"],
        "expected_keywords": ["dị ứng nặng", "khó thở", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_blood_test_001",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "xét nghiệm máu là gì và dùng để kiểm tra những gì",
        "expected_chunk_ids": ["kb_v1_005_c1", "kb_v1_006_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["xét nghiệm máu", "bác sĩ", "kiểm tra"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_002",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "tại sao bác sĩ chỉ định xét nghiệm máu",
        "expected_chunk_ids": ["kb_v1_006_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["chỉ định", "xét nghiệm máu", "bác sĩ"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_003",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "có những loại xét nghiệm máu phổ biến nào",
        "expected_chunk_ids": ["kb_v1_007_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["loại xét nghiệm máu", "thường gặp"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_004",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "trước khi xét nghiệm máu cần nhịn ăn hay chuẩn bị gì",
        "expected_chunk_ids": ["kb_v1_008_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["chuẩn bị", "xét nghiệm máu"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_005",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "kết quả xét nghiệm máu phức tạp cần hỏi ai giải thích",
        "expected_chunk_ids": ["kb_v1_009_c1", "kb_v1_3_042_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["kết quả xét nghiệm máu", "nhân viên y tế", "giải thích"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_006",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "CBC công thức máu toàn bộ giúp kiểm tra thiếu máu hay nhiễm trùng không",
        "expected_chunk_ids": ["kb_v1_2_019_c1", "kb_v1_2_020_c1"],
        "expected_source_ids": ["medlineplus_cbc_test"],
        "expected_keywords": ["CBC", "tế bào máu", "thiếu máu"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_007",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "BMP xét nghiệm chuyển hóa cơ bản liên quan chức năng thận như thế nào",
        "expected_chunk_ids": ["kb_v1_2_017_c1", "kb_v1_2_018_c1"],
        "expected_source_ids": ["medlineplus_bmp_test"],
        "expected_keywords": ["BMP", "chuyển hóa cơ bản", "chức năng thận"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_008",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "CRP có cho biết vị trí viêm trong cơ thể không",
        "expected_chunk_ids": ["kb_v1_2_021_c1", "kb_v1_2_022_c1"],
        "expected_source_ids": ["medlineplus_crp_test"],
        "expected_keywords": ["CRP", "viêm", "không chỉ ra vị trí"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_009",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "D-dimer bất thường có tự kết luận cục máu đông được không",
        "expected_chunk_ids": ["kb_v1_2_023_c1", "kb_v1_2_024_c1"],
        "expected_source_ids": ["medlineplus_ddimer_test"],
        "expected_keywords": ["D-dimer", "cục máu đông", "xét nghiệm tiếp"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_blood_test_010",
        "group": "giai_thich_xet_nghiem_mau_pho_bien",
        "query": "troponin tăng có chắc là nhồi máu cơ tim không",
        "expected_chunk_ids": ["kb_v1_2_027_c1", "kb_v1_2_028_c1"],
        "expected_source_ids": ["medlineplus_troponin_test"],
        "expected_keywords": ["Troponin", "nhồi máu cơ tim", "không phải lúc nào"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_sepsis_001",
        "group": "nhiem_trung_nang_sepsis",
        "query": "nghi nhiễm trùng nặng rất mệt và xấu đi nhanh cần làm gì",
        "expected_chunk_ids": ["kb_v1_001_c1", "kb_v1_3_039_c1"],
        "expected_source_ids": ["nice_sepsis_overview", "nice_sepsis_guideline"],
        "expected_keywords": ["nhiễm trùng", "rất mệt", "đánh giá y tế"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_sepsis_002",
        "group": "nhiem_trung_nang_sepsis",
        "query": "sepsis ở người từ 16 tuổi trở lên có dấu hiệu không ổn cần đánh giá không",
        "expected_chunk_ids": ["kb_v1_3_039_c1"],
        "expected_source_ids": ["nice_sepsis_guideline"],
        "expected_keywords": ["sepsis", "người từ 16 tuổi", "đánh giá y tế"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_sepsis_003",
        "group": "nhiem_trung_nang_sepsis",
        "query": "dấu hiệu bên ngoài nào làm tăng cảnh giác nhiễm trùng nặng",
        "expected_chunk_ids": ["kb_v1_002_c1"],
        "expected_source_ids": ["nice_sepsis_overview"],
        "expected_keywords": ["dấu hiệu", "cảnh giác", "nhiễm trùng nặng"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_sepsis_004",
        "group": "nhiem_trung_nang_sepsis",
        "query": "nhiễm trùng có nguy cơ cao khi nào cần chuyển cấp cứu ngay",
        "expected_chunk_ids": ["kb_v1_004_c1"],
        "expected_source_ids": ["nice_sepsis_overview"],
        "expected_keywords": ["nguy cơ cao", "nhiễm trùng nặng", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_sepsis_005",
        "group": "nhiem_trung_nang_sepsis",
        "query": "người bệnh nhiễm trùng trước đó chưa quá xấu nhưng nay lo ngại tăng lên",
        "expected_chunk_ids": ["kb_v1_003_c1"],
        "expected_source_ids": ["nice_sepsis_overview"],
        "expected_keywords": ["lo ngại", "theo dõi", "chưa quá xấu"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_sepsis_006",
        "group": "nhiem_trung_nang_sepsis",
        "query": "sepsis có áp dụng cho trẻ em hoặc người đang mang thai không",
        "expected_chunk_ids": ["kb_v1_3_039_c1"],
        "expected_source_ids": ["nice_sepsis_guideline"],
        "expected_keywords": ["không áp dụng", "trẻ em", "mang thai"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_sepsis_007",
        "group": "nhiem_trung_nang_sepsis",
        "query": "bị nhiễm trùng thấy rất không ổn thì HomeLab có chẩn đoán sepsis được không",
        "expected_chunk_ids": ["kb_v1_001_c1", "kb_v1_3_039_c1"],
        "expected_source_ids": ["nice_sepsis_overview", "nice_sepsis_guideline"],
        "expected_keywords": ["không chẩn đoán", "đánh giá y tế", "nhiễm trùng"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_ambiguous_001",
        "group": "cau_hoi_mo_ho_thieu_thong_tin",
        "query": "tôi thấy rất không ổn nhưng không biết mô tả triệu chứng thế nào",
        "expected_chunk_ids": ["kb_v1_001_c1", "kb_v1_3_039_c1"],
        "expected_source_ids": ["nice_sepsis_overview", "nice_sepsis_guideline"],
        "expected_keywords": ["rất không ổn", "đánh giá y tế", "nhiễm trùng"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_ambiguous_002",
        "group": "cau_hoi_mo_ho_thieu_thong_tin",
        "query": "tôi bị đau nhưng không rõ đau ở đâu và có cần khám không",
        "expected_chunk_ids": ["kb_v1_2_036_c1", "kb_v1_2_034_c1", "kb_v1_011_c1"],
        "expected_source_ids": ["nhs_stomach_ache", "nhs_headaches", "chest_pain"],
        "expected_keywords": ["khám sớm", "đau", "đánh giá"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_ambiguous_003",
        "group": "cau_hoi_mo_ho_thieu_thong_tin",
        "query": "kết quả xét nghiệm có vài chỉ số lạ tôi không hiểu",
        "expected_chunk_ids": ["kb_v1_009_c1", "kb_v1_3_042_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["kết quả", "nhân viên y tế", "giải thích"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_ambiguous_004",
        "group": "cau_hoi_mo_ho_thieu_thong_tin",
        "query": "tôi hơi khó chịu trong người không biết nên xét nghiệm gì",
        "expected_chunk_ids": ["kb_v1_006_c1", "kb_v1_3_042_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["bác sĩ", "xét nghiệm máu", "giải thích"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_ambiguous_005",
        "group": "cau_hoi_mo_ho_thieu_thong_tin",
        "query": "triệu chứng của tôi có cần đi viện ngay hay chỉ theo dõi",
        "expected_chunk_ids": ["kb_v1_004_c1", "kb_v1_2_029_c1", "kb_v1_2_031_c1"],
        "expected_source_ids": ["nice_sepsis_overview", "nhs_anaphylaxis", "nhs_fainting_adults"],
        "expected_keywords": ["cấp cứu", "đánh giá y tế", "triệu chứng"],
        "risk_expectation": "urgent",
    },
    {
        "id": "v2_customer_need_001",
        "group": "nhu_cau_khach_hang_tu_van_xet_nghiem",
        "query": "tôi muốn đặt gói xét nghiệm máu tổng quát thì cần hiểu điều gì trước",
        "expected_chunk_ids": ["kb_v1_005_c1", "kb_v1_006_c1", "kb_v1_008_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["xét nghiệm máu", "chuẩn bị", "bác sĩ"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_customer_need_002",
        "group": "nhu_cau_khach_hang_tu_van_xet_nghiem",
        "query": "HomeLab tư vấn tôi nên chọn CBC hay xét nghiệm máu loại nào",
        "expected_chunk_ids": ["kb_v1_007_c1", "kb_v1_2_019_c1"],
        "expected_source_ids": ["blood_tests", "medlineplus_cbc_test"],
        "expected_keywords": ["loại xét nghiệm máu", "CBC", "tế bào máu"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_customer_need_003",
        "group": "nhu_cau_khach_hang_tu_van_xet_nghiem",
        "query": "tôi muốn xét nghiệm vì nghi nhiễm trùng thì chỉ số nào liên quan",
        "expected_chunk_ids": ["kb_v1_2_019_c1", "kb_v1_2_021_c1", "kb_v1_2_016_c1"],
        "expected_source_ids": ["medlineplus_cbc_test", "medlineplus_crp_test", "medlineplus_blood_culture_test"],
        "expected_keywords": ["nhiễm trùng", "CBC", "CRP"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_customer_need_004",
        "group": "nhu_cau_khach_hang_tu_van_xet_nghiem",
        "query": "đau ngực thì tôi nên xét nghiệm troponin hay đi cấp cứu trước",
        "expected_chunk_ids": ["kb_v1_010_c1", "kb_v1_3_040_c1", "kb_v1_2_027_c1"],
        "expected_source_ids": ["chest_pain", "medlineplus_troponin_test"],
        "expected_keywords": ["đau ngực", "cấp cứu", "Troponin"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_customer_need_005",
        "group": "nhu_cau_khach_hang_tu_van_xet_nghiem",
        "query": "kết quả xét nghiệm máu có đủ để loại trừ bệnh không",
        "expected_chunk_ids": ["kb_v1_3_042_c1", "kb_v1_009_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["xét nghiệm máu", "không tự kết luận", "nhân viên y tế"],
        "risk_expectation": "informational",
    },
    {
        "id": "v2_noisy_001",
        "group": "cau_hoi_nhieu_dien_dat_doi_thuong",
        "query": "đau ngực toát mồ hôi buồn nôn thở không nổi giờ sao",
        "expected_chunk_ids": ["kb_v1_010_c1", "kb_v1_3_040_c1"],
        "expected_source_ids": ["chest_pain"],
        "expected_keywords": ["đau ngực", "vã mồ hôi", "khó thở"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_noisy_002",
        "group": "cau_hoi_nhieu_dien_dat_doi_thuong",
        "query": "khó thở môi tím người lơ mơ có nguy hiểm lắm không",
        "expected_chunk_ids": ["kb_v1_013_c1", "kb_v1_3_041_c1"],
        "expected_source_ids": ["shortness_of_breath"],
        "expected_keywords": ["khó thở", "xanh tím", "lú lẫn"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_noisy_003",
        "group": "cau_hoi_nhieu_dien_dat_doi_thuong",
        "query": "xỉu cái rầm xong tức ngực khó thở",
        "expected_chunk_ids": ["kb_v1_2_031_c1"],
        "expected_source_ids": ["nhs_fainting_adults"],
        "expected_keywords": ["ngất", "đau ngực", "khó thở"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_noisy_004",
        "group": "cau_hoi_nhieu_dien_dat_doi_thuong",
        "query": "bị dị ứng sưng phù mặt nghẹn cổ thở khò khè",
        "expected_chunk_ids": ["kb_v1_2_029_c1"],
        "expected_source_ids": ["nhs_anaphylaxis"],
        "expected_keywords": ["dị ứng nặng", "khó thở", "cấp cứu"],
        "risk_expectation": "emergency",
    },
    {
        "id": "v2_noisy_005",
        "group": "cau_hoi_nhieu_dien_dat_doi_thuong",
        "query": "kq máu nhiều chỉ số cao thấp đọc không hiểu hỏi ai",
        "expected_chunk_ids": ["kb_v1_009_c1", "kb_v1_3_042_c1"],
        "expected_source_ids": ["blood_tests"],
        "expected_keywords": ["kết quả xét nghiệm máu", "nhân viên y tế", "giải thích"],
        "risk_expectation": "informational",
    },
]


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_artifact_dir(manifest: dict[str, Any]) -> Path:
    artifact_dir = ROOT / manifest["artifact_dir"]
    if not artifact_dir.exists():
        raise FileNotFoundError(f"Artifact directory not found: {artifact_dir}")
    return artifact_dir


def retrieve(
    query: str,
    *,
    model: SentenceTransformer,
    index: faiss.Index,
    chunks: list[dict[str, Any]],
    config: dict[str, Any],
    top_k: int,
) -> list[dict[str, Any]]:
    query_text = config.get("query_prefix", "query: ") + query.strip()
    query_embedding = model.encode(
        [query_text],
        convert_to_numpy=True,
        normalize_embeddings=bool(config.get("normalized", True)),
        show_progress_bar=False,
    ).astype("float32")
    scores, indices = index.search(query_embedding, top_k)

    results: list[dict[str, Any]] = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        chunk = chunks[int(idx)]
        results.append(
            {
                "rank": len(results) + 1,
                "score": float(score),
                "chunk_id": chunk["chunk_id"],
                "kb_id": chunk["kb_id"],
                "source_id": chunk["source_id"],
                "section": chunk["section"],
                "title": chunk["title"],
                "risk_level": chunk.get("risk_level"),
            }
        )
    return results


def normalize_terms(values: list[str] | None) -> list[str]:
    return [value.casefold() for value in (values or []) if value.strip()]


def expected_result_at_rank(row: dict[str, Any], rank: int) -> bool:
    expected_chunk_ids = set(row.get("expected_chunk_ids") or [])
    expected_source_ids = set(row.get("expected_source_ids") or [])
    results = row["results"]
    if rank > len(results):
        return False
    result = results[rank - 1]
    if expected_chunk_ids and result["chunk_id"] in expected_chunk_ids:
        return True
    if not expected_chunk_ids and expected_source_ids and result["source_id"] in expected_source_ids:
        return True
    if expected_chunk_ids and expected_source_ids:
        return result["source_id"] in expected_source_ids
    return False


def hit_at(row: dict[str, Any], k: int) -> bool:
    return any(expected_result_at_rank(row, rank) for rank in range(1, min(k, len(row["results"])) + 1))


def reciprocal_rank_at(row: dict[str, Any], k: int) -> float:
    for rank in range(1, min(k, len(row["results"])) + 1):
        if expected_result_at_rank(row, rank):
            return 1.0 / rank
    return 0.0


def source_hit_at(row: dict[str, Any], k: int) -> bool:
    expected_source_ids = set(row.get("expected_source_ids") or [])
    if not expected_source_ids:
        return False
    return any(result["source_id"] in expected_source_ids for result in row["results"][:k])


def keyword_coverage_at(
    row: dict[str, Any],
    *,
    chunks_by_id: dict[str, dict[str, Any]],
    k: int,
) -> float:
    expected_keywords = normalize_terms(row.get("expected_keywords"))
    if not expected_keywords:
        return 1.0
    haystack = "\n".join(
        chunks_by_id[result["chunk_id"]].get("chunk_text", "").casefold()
        for result in row["results"][:k]
    )
    matched = sum(1 for keyword in expected_keywords if keyword in haystack)
    return matched / len(expected_keywords)


def metric_mean(rows: list[dict[str, Any]], key: str) -> float:
    return mean(float(row[key]) for row in rows) if rows else 0.0


def build_group_breakdown(rows: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[row["group"]].append(row)

    breakdown: dict[str, Any] = {}
    for group, group_rows in sorted(groups.items()):
        breakdown[group] = {
            "query_count": len(group_rows),
            "hit_at_1": metric_mean(group_rows, "hit_at_1"),
            "hit_at_3": metric_mean(group_rows, "hit_at_3"),
            "hit_at_5": metric_mean(group_rows, "hit_at_5"),
            "mrr_at_5": metric_mean(group_rows, "mrr_at_5"),
            "expected_source_hit_at_3": metric_mean(group_rows, "expected_source_hit_at_3"),
            "expected_source_hit_at_5": metric_mean(group_rows, "expected_source_hit_at_5"),
            "keyword_coverage_at_3": metric_mean(group_rows, "keyword_coverage_at_3"),
        }
    return breakdown


def readiness_note(metrics: dict[str, float], failures: list[dict[str, Any]]) -> tuple[str, str]:
    if failures:
        return (
            "not_ready_for_runtime_switch",
            "Không nên switch runtime sau eval này; cần review các failure case và/hoặc mở rộng kiểm thử trước.",
        )
    if metrics["hit_at_3"] >= 0.9 and metrics["hit_at_5"] >= 0.95 and metrics["keyword_coverage_at_3"] >= 0.75:
        return (
            "candidate_ready_for_runtime_integration_review",
            "Có thể dùng kết quả này làm điều kiện để bước tiếp theo kiểm thử tích hợp runtime có kiểm soát; chưa nên switch runtime trực tiếp chỉ từ eval offline.",
        )
    return (
        "needs_more_retrieval_tuning_before_runtime_switch",
        "Chưa nên switch runtime; cần review chất lượng retrieval và chạy thêm eval có kiểm soát.",
    )


def write_markdown_report(report: dict[str, Any]) -> None:
    metrics = report["metrics"]
    md_lines = [
        "# retriever_v1_3 Eval v2 Report",
        "",
        "## Scope",
        "",
        "This larger retrieval eval loads the existing `retriever_v1_3` artifact only. It does not modify KB source data, chunking, embeddings, FAISS, backend, frontend, runtime, policy, package catalog, or recommendation-layer logic.",
        "",
        "## Artifact Loaded",
        "",
        f"- Retriever version: `{report['retriever_version']}`",
        f"- KB version: `{report['kb_version']}`",
        f"- Artifact dir: `{report['artifact_dir']}`",
        f"- Model: `{report['model_name']}`",
        f"- Text field: `{report['text_field']}`",
        f"- Eval top-k: `{report['top_k']}`",
        f"- Chunk count: `{report['chunk_count']}`",
        "",
        "## Metrics Summary",
        "",
        f"- Query count: `{report['query_count']}`",
        f"- Hit@1: `{metrics['hit_at_1']:.4f}`",
        f"- Hit@3: `{metrics['hit_at_3']:.4f}`",
        f"- Hit@5: `{metrics['hit_at_5']:.4f}`",
        f"- MRR@5: `{metrics['mrr_at_5']:.4f}`",
        f"- Expected source Hit@3: `{metrics['expected_source_hit_at_3']:.4f}`",
        f"- Expected source Hit@5: `{metrics['expected_source_hit_at_5']:.4f}`",
        f"- Keyword coverage@3: `{metrics['keyword_coverage_at_3']:.4f}`",
        "",
        "## Group Breakdown",
        "",
        "| Group | Queries | Hit@1 | Hit@3 | Hit@5 | MRR@5 | Source@3 | Source@5 | Keyword@3 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for group, row in report["group_breakdown"].items():
        md_lines.append(
            f"| `{group}` | {row['query_count']} | {row['hit_at_1']:.4f} | {row['hit_at_3']:.4f} | {row['hit_at_5']:.4f} | {row['mrr_at_5']:.4f} | {row['expected_source_hit_at_3']:.4f} | {row['expected_source_hit_at_5']:.4f} | {row['keyword_coverage_at_3']:.4f} |"
        )

    md_lines.extend(["", "## Failure Cases", ""])
    if report["failure_cases"]:
        for row in report["failure_cases"]:
            md_lines.extend(
                [
                    f"- `{row['id']}` / `{row['group']}`",
                    f"  - Query: {row['query']}",
                    f"  - Expected chunks: `{', '.join(row.get('expected_chunk_ids') or []) or 'n/a'}`",
                    f"  - Expected sources: `{', '.join(row.get('expected_source_ids') or []) or 'n/a'}`",
                    f"  - Top5: `{', '.join(row['top5_chunk_ids'])}`",
                    f"  - Keyword coverage@3: `{row['keyword_coverage_at_3']:.4f}`",
                ]
            )
    else:
        md_lines.append("- None")

    md_lines.extend(
        [
            "",
            "## Runtime Readiness Note",
            "",
            f"- Status: `{report['runtime_readiness']}`",
            f"- Recommendation: {report['runtime_recommendation']}",
            "- Runtime has not been switched to `retriever_v1_3` by this eval step.",
        ]
    )

    MD_REPORT_PATH.write_text("\n".join(md_lines) + "\n", encoding="utf-8")


def main() -> int:
    manifest = load_json(MANIFEST_PATH)
    config = load_json(CONFIG_PATH)
    artifact_dir = resolve_artifact_dir(manifest)

    chunks = load_json(artifact_dir / manifest["kb_file"])
    metadata = load_json(artifact_dir / manifest["metadata_file"])
    index = faiss.read_index(str(artifact_dir / manifest["faiss_index_file"]))

    expected_count = int(manifest["chunk_count"])
    if len(chunks) != expected_count:
        raise RuntimeError("Chunk count does not match retriever_manifest.json")
    if len(metadata) != expected_count:
        raise RuntimeError("Metadata count does not match retriever_manifest.json")
    if index.ntotal != expected_count:
        raise RuntimeError("FAISS ntotal does not match retriever_manifest.json")

    model = SentenceTransformer(config["model_name"])
    top_k = 5
    chunks_by_id = {chunk["chunk_id"]: chunk for chunk in chunks}

    rows: list[dict[str, Any]] = []
    for case in EVAL_CASES:
        results = retrieve(
            case["query"],
            model=model,
            index=index,
            chunks=chunks,
            config=config,
            top_k=top_k,
        )
        row = {
            **case,
            "results": results,
            "top1": results[0] if results else None,
            "top3_chunk_ids": [result["chunk_id"] for result in results[:3]],
            "top5_chunk_ids": [result["chunk_id"] for result in results[:5]],
        }
        row["hit_at_1"] = 1.0 if hit_at(row, 1) else 0.0
        row["hit_at_3"] = 1.0 if hit_at(row, 3) else 0.0
        row["hit_at_5"] = 1.0 if hit_at(row, 5) else 0.0
        row["mrr_at_5"] = reciprocal_rank_at(row, 5)
        row["expected_source_hit_at_3"] = 1.0 if source_hit_at(row, 3) else 0.0
        row["expected_source_hit_at_5"] = 1.0 if source_hit_at(row, 5) else 0.0
        row["keyword_coverage_at_3"] = keyword_coverage_at(row, chunks_by_id=chunks_by_id, k=3)
        rows.append(row)

    metrics = {
        "hit_at_1": metric_mean(rows, "hit_at_1"),
        "hit_at_3": metric_mean(rows, "hit_at_3"),
        "hit_at_5": metric_mean(rows, "hit_at_5"),
        "mrr_at_5": metric_mean(rows, "mrr_at_5"),
        "expected_source_hit_at_3": metric_mean(rows, "expected_source_hit_at_3"),
        "expected_source_hit_at_5": metric_mean(rows, "expected_source_hit_at_5"),
        "keyword_coverage_at_3": metric_mean(rows, "keyword_coverage_at_3"),
    }
    failures = [row for row in rows if row["hit_at_5"] < 1.0 or row["keyword_coverage_at_3"] < 0.5]
    runtime_readiness, runtime_recommendation = readiness_note(metrics, failures)

    report = {
        "eval_name": "retriever_v1_3_eval_v2",
        "retriever_version": manifest["retriever_version"],
        "kb_version": manifest["kb_version"],
        "artifact_dir": manifest["artifact_dir"],
        "model_name": config["model_name"],
        "text_field": config.get("text_field", "chunk_text"),
        "top_k": top_k,
        "chunk_count": len(chunks),
        "metadata_count": len(metadata),
        "faiss_ntotal": index.ntotal,
        "query_count": len(rows),
        "metrics": metrics,
        "group_breakdown": build_group_breakdown(rows),
        "failure_cases": [
            {
                "id": row["id"],
                "group": row["group"],
                "query": row["query"],
                "risk_expectation": row.get("risk_expectation"),
                "expected_chunk_ids": row.get("expected_chunk_ids") or [],
                "expected_source_ids": row.get("expected_source_ids") or [],
                "expected_keywords": row.get("expected_keywords") or [],
                "top5_chunk_ids": row["top5_chunk_ids"],
                "top5_sources": [result["source_id"] for result in row["results"][:5]],
                "keyword_coverage_at_3": row["keyword_coverage_at_3"],
            }
            for row in failures
        ],
        "runtime_readiness": runtime_readiness,
        "runtime_recommendation": runtime_recommendation,
        "rows": rows,
        "no_rebuild_confirmation": {
            "kb_modified": False,
            "chunks_rebuilt": False,
            "embeddings_rebuilt": False,
            "faiss_rebuilt": False,
            "runtime_switched": False,
            "backend_frontend_recommendation_modified": False,
        },
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    JSON_REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_markdown_report(report)

    print(f"query_count={report['query_count']}")
    print(f"hit_at_1={metrics['hit_at_1']:.4f}")
    print(f"hit_at_3={metrics['hit_at_3']:.4f}")
    print(f"hit_at_5={metrics['hit_at_5']:.4f}")
    print(f"mrr_at_5={metrics['mrr_at_5']:.4f}")
    print(f"expected_source_hit_at_3={metrics['expected_source_hit_at_3']:.4f}")
    print(f"expected_source_hit_at_5={metrics['expected_source_hit_at_5']:.4f}")
    print(f"keyword_coverage_at_3={metrics['keyword_coverage_at_3']:.4f}")
    print(f"failure_cases={len(failures)}")
    print(f"json_report={JSON_REPORT_PATH}")
    print(f"md_report={MD_REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
