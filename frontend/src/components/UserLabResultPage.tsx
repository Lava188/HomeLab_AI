import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import {
  interpretLabResultPdf,
  LabResultApiError,
  LabResultFlag,
  LabResultInterpretationData,
  LabResultSeverity,
  ParsedLabResultItem,
} from '../api/labResultApi';

const FLAG_LABELS: Record<LabResultFlag, string> = {
  NORMAL: 'Trong khoảng tham chiếu',
  HIGH: 'Cao hơn khoảng tham chiếu',
  LOW: 'Thấp hơn khoảng tham chiếu',
  UNKNOWN: 'Chưa đủ dữ liệu',
};

const SEVERITY_LABELS: Record<LabResultSeverity, string> = {
  NORMAL: 'Bình thường',
  MILD_HIGH: 'Cao nhẹ',
  MODERATE_HIGH: 'Cao vừa',
  MARKED_HIGH: 'Cao rõ',
  MILD_LOW: 'Thấp nhẹ',
  MODERATE_LOW: 'Thấp vừa',
  MARKED_LOW: 'Thấp rõ',
  UNKNOWN: 'Chưa xác định',
};

const CONFIDENCE_LABELS = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

const GROUP_LABELS: Record<string, string> = {
  CBC: 'Công thức máu',
  Liver: 'Chức năng gan',
  Kidney: 'Chức năng thận',
  Glucose: 'Đường huyết',
  Lipid: 'Mỡ máu',
};

function getErrorMessage(error: unknown) {
  if (error instanceof LabResultApiError) {
    if (error.code === 'LAB_RESULT_FILE_REQUIRED') {
      return 'Vui lòng chọn file PDF kết quả xét nghiệm.';
    }

    if (error.code === 'LAB_RESULT_PDF_ONLY') {
      return 'HomeLab hiện chỉ hỗ trợ file PDF.';
    }

    if (error.code === 'LAB_RESULT_NO_EXTRACTABLE_TEXT') {
      return 'HomeLab chưa đọc được nội dung text từ PDF này. File có thể là bản scan/ảnh hoặc định dạng không hỗ trợ.';
    }

    return error.message || 'Không thể phân tích file PDF này. Vui lòng thử lại.';
  }

  return 'Không thể kết nối tới hệ thống phân tích. Vui lòng kiểm tra kết nối và thử lại.';
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReference(item: ParsedLabResultItem) {
  if (item.referenceRangeRaw) return item.referenceRangeRaw;
  if (item.referenceLow !== null && item.referenceHigh !== null) {
    return `${item.referenceLow} - ${item.referenceHigh}`;
  }
  if (item.referenceLow !== null) return `>= ${item.referenceLow}`;
  if (item.referenceHigh !== null) return `<= ${item.referenceHigh}`;
  return 'Chưa đọc được';
}

function flagTone(flag: LabResultFlag) {
  if (flag === 'NORMAL') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (flag === 'HIGH' || flag === 'LOW') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function UserLabResultPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<LabResultInterpretationData | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const summaryCards = useMemo(() => {
    const summary = result?.professionalSummary;

    return [
      {
        label: 'Tổng số',
        value: summary?.totalParsed ?? 0,
        tone: 'border-slate-200 bg-white text-slate-800',
      },
      {
        label: 'Bình thường',
        value: summary?.normalCount ?? 0,
        tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      },
      {
        label: 'Bất thường',
        value: summary?.abnormalCount ?? 0,
        tone: 'border-amber-100 bg-amber-50 text-amber-800',
      },
      {
        label: 'Chưa đánh giá được',
        value: summary?.unknownCount ?? 0,
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
      },
    ];
  }, [result]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] || null;
    setResult(null);
    setError('');

    if (!nextFile) {
      setSelectedFile(null);
      return;
    }

    if (nextFile.type !== 'application/pdf' && !nextFile.name.toLowerCase().endsWith('.pdf')) {
      setSelectedFile(null);
      setError('HomeLab hiện chỉ hỗ trợ file PDF.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(nextFile);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!selectedFile) {
      setError('Vui lòng chọn file PDF kết quả xét nghiệm.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await interpretLabResultPdf(selectedFile);
      setResult(data);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Phân tích kết quả xét nghiệm PDF</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Tải lên file PDF kết quả xét nghiệm để HomeLab đọc chỉ số, so sánh với khoảng tham chiếu trên phiếu và giải thích ý nghĩa ở mức thông tin chung.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-800">
            Chỉ hỗ trợ PDF có lớp text. File scan hoặc ảnh có thể không đọc được.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-teal-300 hover:bg-teal-50/50 lg:flex-1">
              <UploadCloud className="h-8 w-8 text-teal-700" />
              <span className="mt-3 text-sm font-semibold text-slate-800">Chọn file PDF kết quả xét nghiệm</span>
              <span className="mt-1 text-xs text-slate-500">Định dạng .pdf</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:w-80">
              <p className="text-xs font-semibold uppercase text-slate-400">File đã chọn</p>
              {selectedFile ? (
                <div className="mt-3 min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900" title={selectedFile.name}>
                    {selectedFile.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Chưa chọn file</p>
              )}
              <button
                type="submit"
                disabled={!selectedFile || isLoading}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {isLoading ? 'Đang phân tích...' : 'Phân tích kết quả'}
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      {result ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <Info className="mt-1 h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Tổng quan</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {result.professionalSummary.overviewVi || 'HomeLab đã hoàn tất phân tích file PDF.'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summaryCards.map((card) => (
                <div key={card.label} className={`rounded-2xl border p-4 ${card.tone}`}>
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold">{card.value}</p>
                </div>
              ))}
            </div>

            {result.professionalSummary.conclusionVi ? (
              <div
                className={`mt-5 rounded-2xl border p-4 ${
                  result.professionalSummary.abnormalCount > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-teal-100 bg-teal-50 text-teal-900'
                }`}
              >
                <p className="text-sm font-semibold">Kết luận ngắn gọn</p>
                <p className="mt-2 text-sm leading-6">{result.professionalSummary.conclusionVi}</p>
                {result.professionalSummary.unknownCount > 0 ? (
                  <p className="mt-2 text-sm leading-6">
                    Một số chỉ số chưa đánh giá được vì HomeLab chưa đọc được khoảng tham chiếu từ PDF.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <ParsedItemsTable items={result.parsedItems} totalParsed={result.professionalSummary.totalParsed} />
          <GroupSummaries result={result} />
          <ItemInterpretations result={result} />
          <SafetyNotes result={result} />
          <Limitations result={result} />
        </div>
      ) : null}
    </div>
  );
}

function ParsedItemsTable({ items, totalParsed }: { items: ParsedLabResultItem[]; totalParsed: number }) {
  if (items.length === 0 || totalParsed === 0) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h3 className="text-lg font-semibold text-amber-950">Chưa nhận diện được chỉ số xét nghiệm</h3>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              HomeLab chưa nhận diện được chỉ số xét nghiệm có cấu trúc từ file này. File có thể là PDF scan/ảnh, bảng bị lệch cột hoặc không có lớp text xét nghiệm rõ ràng.
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Bạn có thể thử tải lên file PDF có lớp text rõ hơn hoặc nhập lại các chỉ số chính cần giải thích.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold text-slate-900">Bảng chỉ số đọc được</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Chỉ số</th>
              <th className="px-5 py-3 font-semibold">Nhóm</th>
              <th className="px-5 py-3 font-semibold">Kết quả</th>
              <th className="px-5 py-3 font-semibold">Khoảng tham chiếu</th>
              <th className="px-5 py-3 font-semibold">Đánh giá</th>
              <th className="px-5 py-3 font-semibold">Độ tin cậy parse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.code} className="align-top">
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-900">{item.code}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.nameVi}</p>
                </td>
                <td className="px-5 py-4 text-slate-700">{GROUP_LABELS[item.group] || item.group}</td>
                <td className="px-5 py-4 font-medium text-slate-900">
                  {item.value} {item.unit || ''}
                </td>
                <td className="px-5 py-4 text-slate-700">{formatReference(item)}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${flagTone(item.flag)}`}>
                    {FLAG_LABELS[item.flag]}
                  </span>
                  <p className="mt-1 text-xs text-slate-500">{SEVERITY_LABELS[item.severity]}</p>
                </td>
                <td className="px-5 py-4 text-slate-700">{CONFIDENCE_LABELS[item.parseConfidence]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupSummaries({ result }: { result: LabResultInterpretationData }) {
  const groups = result.professionalSummary.groupSummaries || [];
  if (groups.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Phân tích theo nhóm</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <article key={group.group} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">
                  {group.groupNameVi || GROUP_LABELS[group.group] || group.group}
                </h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">{group.summaryVi}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {group.total ?? 0} chỉ số
              </span>
            </div>
            {group.highlightsVi && group.highlightsVi.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {group.highlightsVi.map((highlight) => (
                  <span key={highlight} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ItemInterpretations({ result }: { result: LabResultInterpretationData }) {
  const interpretations = result.professionalSummary.itemInterpretations || [];
  if (interpretations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Giải thích từng chỉ số</h3>
      <div className="mt-4 space-y-4">
        {interpretations.map((item) => (
          <article key={item.code} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="font-semibold text-slate-900">
                  {item.nameVi} <span className="text-slate-400">({item.code})</span>
                </h4>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.summaryVi}</p>
              </div>
              <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${flagTone(item.flag)}`}>
                {FLAG_LABELS[item.flag]}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-600 lg:grid-cols-2">
              {item.whatItIsVi ? <InfoBlock label="Chỉ số này là gì" value={item.whatItIsVi} /> : null}
              {item.comparisonVi ? <InfoBlock label="So sánh với khoảng tham chiếu" value={item.comparisonVi} /> : null}
              {item.generalMeaningVi ? <InfoBlock label="Ý nghĩa chung" value={item.generalMeaningVi} /> : null}
              {item.readWithContextVi ? <InfoBlock label="Cần đọc cùng bối cảnh" value={item.readWithContextVi} /> : null}
              {item.nonDiagnosisNoteVi ? <InfoBlock label="Lưu ý" value={item.nonDiagnosisNoteVi} /> : null}
            </div>
            {item.evidenceText ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Minh chứng đọc từ PDF</p>
                <p className="mt-2 break-words text-sm leading-6 text-slate-700">{item.evidenceText}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function SafetyNotes({ result }: { result: LabResultInterpretationData }) {
  const notes = result.professionalSummary.safetyNotes || [];
  if (notes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-teal-100 bg-teal-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-teal-700" />
        <div>
          <h3 className="text-lg font-semibold text-teal-950">Lưu ý an toàn</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-teal-900">
            {notes.map((note) => (
              <li key={note} className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-teal-700" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Limitations({ result }: { result: LabResultInterpretationData }) {
  const limitations = result.professionalSummary.limitations || [];
  if (limitations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Giới hạn</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {limitations.map((limitation) => (
          <li key={limitation} className="flex gap-2">
            <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
            <span>{limitation}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-2">{value}</p>
    </div>
  );
}
