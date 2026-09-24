import React, { useState, useEffect, useRef } from 'react';
import { 
  Exam, 
  ExamQuestion, 
  ExamSubmission, 
  Student, 
  UserAccount 
} from '../types/index.ts';
import { 
  shuffleExamQuestionsAndOptions, 
  calculateExamScore 
} from '../utils/studentHelper.ts';
import { HotspotCanvas } from './HotspotCanvas.tsx';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight, 
  Award, 
  X, 
  RefreshCw,
  HelpCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  GripVertical,
  RotateCcw,
  Link2,
  Unlink,
  MousePointer
} from 'lucide-react';

interface ExamTakingModalProps {
  exam: Exam;
  currentUser: Student | UserAccount;
  isTeacherTesting?: boolean;
  onClose: () => void;
  onSubmitSuccess: (submission: ExamSubmission) => void;
  onReviewAnswers?: (submission: ExamSubmission) => void;
  attemptNumber?: number;
}

export const ExamTakingModal: React.FC<ExamTakingModalProps> = ({
  exam,
  currentUser,
  isTeacherTesting = false,
  onClose,
  onSubmitSuccess,
  onReviewAnswers,
  attemptNumber = 1,
}) => {
  // Snapshot câu hỏi được xáo trộn chuẩn bị cho lượt thi này
  const [shuffledQuestions] = useState<ExamQuestion[]>(() =>
    shuffleExamQuestionsAndOptions(
      exam.questions,
      exam.isPracticeTest,
      exam.practiceRandomCount
    )
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<number>(exam.durationMinutes * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<ExamSubmission | null>(null);

  // Anti-cheat monitoring state
  const [violationCount, setViolationCount] = useState(0);
  const [violationLogs, setViolationLogs] = useState<Array<{ id: string; time: string; type: string; label: string }>>([]);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [currentViolationReason, setCurrentViolationReason] = useState<string>('');
  const lastViolationTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const isFinishedRef = useRef<boolean>(false);

  // Drag and Drop & Matching state
  const [draggedLeftPairId, setDraggedLeftPairId] = useState<string | null>(null);
  const [dragOverRightId, setDragOverRightId] = useState<string | null>(null);
  const [selectedLeftIdForClick, setSelectedLeftIdForClick] = useState<string | null>(null);

  const currentQ = shuffledQuestions[currentIndex];
  const totalQuestions = shuffledQuestions.length;

  // Ghi nhận vi phạm quy chế thi (chuột phải, F12, rời màn hình...)
  const recordViolation = (type: string, label: string) => {
    if (isTeacherTesting || isFinishedRef.current) return;

    // Chống duplicate trigger liên tục trong 1 giây (ví dụ chuyển tab vừa kích hoạt blur vừa kích hoạt visibilitychange)
    const now = Date.now();
    if (now - lastViolationTimeRef.current < 1000) return;
    lastViolationTimeRef.current = now;

    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const logItem = {
      id: `viol_${now}_${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      type,
      label,
    };

    setViolationCount((prev) => prev + 1);
    setViolationLogs((prev) => [...prev, logItem]);
    setCurrentViolationReason(label);
    setShowViolationWarning(true);
  };

  // ================= 1. BẢO MẬT PHÒNG THI & CHỐNG GIAN LẬN =================
  useEffect(() => {
    if (isTeacherTesting) return; // Giáo viên làm thử không bị phạt chống gian lận

    // a. Chặn menu chuột phải & ghi nhận vi phạm
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      recordViolation('contextmenu', 'Nhấn chuột phải trong lúc làm bài');
      return false;
    };

    // b. Chặn bôi đen quét khối
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // c. Chặn các phím tắt tìm kiếm, copy, F12, DevTools & ghi nhận vi phạm
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();
      // Phím F12
      if (e.key === 'F12') {
        e.preventDefault();
        recordViolation('f12', 'Nhấn phím F12 (Công cụ kiểm tra DevTools)');
        return false;
      }
      // Ctrl+Shift+I / J / C (DevTools)
      if (e.ctrlKey && e.shiftKey && ['i', 'c', 'j'].includes(keyLower)) {
        e.preventDefault();
        recordViolation('devtools', 'Phím tắt mở DevTools / Kiểm tra mã nguồn (Ctrl+Shift+I/J/C)');
        return false;
      }
      // Ctrl+U (Xem mã nguồn)
      if (e.ctrlKey && keyLower === 'u') {
        e.preventDefault();
        recordViolation('view_source', 'Phím tắt xem mã nguồn bài thi (Ctrl+U)');
        return false;
      }
      // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+F, Ctrl+P, Cmd+C, Cmd+V
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'v', 'x', 'a', 'f', 'p'].includes(keyLower)
      ) {
        e.preventDefault();
        recordViolation('shortcut', `Phím tắt sao chép / thao tác cấm (${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${keyLower.toUpperCase()})`);
        return false;
      }
    };

    // d. Chặn sự kiện sao chép / cắt / dán trực tiếp
    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation('clipboard', 'Cố ý sao chép hoặc dán nội dung trong bài thi');
      return false;
    };

    // e. Phát hiện rời khỏi màn hình bài thi (chuyển tab, thu nhỏ cửa sổ, mở app khác)
    const handleVisibilityChange = () => {
      if (document.hidden && !isFinishedRef.current) {
        recordViolation('visibility', 'Rời khỏi màn hình bài thi (chuyển tab trình duyệt hoặc ẩn cửa sổ)');
      }
    };

    const handleWindowBlur = () => {
      if (!isFinishedRef.current) {
        recordViolation('blur', 'Rời con trỏ khỏi cửa sổ bài thi (chuyển sang ứng dụng khác)');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('selectstart', handleSelectStart);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleClipboard);
    window.addEventListener('paste', handleClipboard);
    window.addEventListener('cut', handleClipboard);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('selectstart', handleSelectStart);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleClipboard);
      window.removeEventListener('paste', handleClipboard);
      window.removeEventListener('cut', handleClipboard);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isTeacherTesting]);

  // ================= 2. ĐẾM NGƯỢC THỜI GIAN LÀM BÀI =================
  useEffect(() => {
    // Giáo viên làm thử: KHÔNG TÍNH THỜI GIAN LÀM BÀI
    if (isTeacherTesting || isFinishedRef.current) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTeacherTesting]);

  const handleTimeExpired = () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    handlePerformSubmission('Hết giờ làm bài! Hệ thống tự động thu bài thi.');
  };

  // ================= 3. LƯU CÂU TRẢ LỜI CHO TỪNG DẠNG CÂU HỎI =================
  const updateAnswer = (questionId: string, val: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: val,
    }));
  };

  // b. Chọn nhiều đáp án: Giới hạn đúng số lượng đáp án đúng của GV
  const handleToggleMultipleChoice = (q: ExamQuestion, optionId: string) => {
    const currentList: string[] = answers[q.id] || [];
    const maxSelectable = q.correctOptionIds?.length || 1;

    if (currentList.includes(optionId)) {
      updateAnswer(q.id, currentList.filter((id) => id !== optionId));
    } else {
      if (currentList.length >= maxSelectable) {
        // Hoán đổi: thay thế đáp án đầu tiên hoặc thông báo
        const updated = [...currentList.slice(1), optionId];
        updateAnswer(q.id, updated);
      } else {
        updateAnswer(q.id, [...currentList, optionId]);
      }
    }
  };

  // c. Ghép đôi: Cập nhật cặp ghép qua Kéo thả hoặc Nhấp chuột
  const handleConnectPair = (qId: string, leftId: string, rightId: string) => {
    const currentMatches: Record<string, string> = { ...(answers[qId] || {}) };
    // Nếu có thẻ nào ở cột A đã ghép với rightId này, gỡ liên kết cũ để đảm bảo ánh xạ 1-1
    Object.keys(currentMatches).forEach((k) => {
      if (currentMatches[k] === rightId) {
        delete currentMatches[k];
      }
    });
    currentMatches[leftId] = rightId;
    updateAnswer(qId, currentMatches);
    setSelectedLeftIdForClick(null);
  };

  const handleDisconnectPair = (qId: string, leftId: string) => {
    const currentMatches: Record<string, string> = { ...(answers[qId] || {}) };
    delete currentMatches[leftId];
    updateAnswer(qId, currentMatches);
    if (selectedLeftIdForClick === leftId) {
      setSelectedLeftIdForClick(null);
    }
  };

  const handleResetMatches = (qId: string) => {
    updateAnswer(qId, {});
    setSelectedLeftIdForClick(null);
  };

  const handleUpdateMatching = (qId: string, pairId: string, rightPairId: string) => {
    if (!rightPairId) {
      handleDisconnectPair(qId, pairId);
    } else {
      handleConnectPair(qId, pairId, rightPairId);
    }
  };

  // d. Sắp xếp thứ tự: di chuyển lên/xuống
  const handleMoveOrderItem = (qId: string, fromIndex: number, toIndex: number) => {
    const currentOrder: string[] =
      answers[qId] || (currentQ.orderingItems ? currentQ.orderingItems.map((i) => i.id) : []);
    if (toIndex < 0 || toIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    updateAnswer(qId, newOrder);
  };

  // e. Đúng / Sai: chọn cột
  const handleUpdateTrueFalse = (qId: string, statementId: string, isTrue: boolean) => {
    const currentTF = answers[qId] || {};
    updateAnswer(qId, {
      ...currentTF,
      [statementId]: isTrue,
    });
  };

  // g. Điền từ vào chỗ trống: chọn từ menu sổ xuống
  const handleUpdateFillBlank = (qId: string, blankId: string, chosenWord: string) => {
    const currentBlanks = answers[qId] || {};
    updateAnswer(qId, {
      ...currentBlanks,
      [blankId]: chosenWord,
    });
  };

  // ================= 4. NỘP BÀI THI & TÍNH ĐIỂM =================
  const handlePerformSubmission = async (_reasonMsg?: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    isFinishedRef.current = true;

    const timeSpentSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const scoreResult = calculateExamScore(shuffledQuestions, answers);

    // Xác định thông tin thí sinh
    const isStudentUser = 'studentCode' in currentUser;
    const studentId = currentUser.id;
    const studentName = currentUser.fullName || currentUser.username;
    const studentCode = isStudentUser ? (currentUser as Student).studentCode : 'GV-TEST';
    const classId = isStudentUser ? (currentUser as Student).classId : exam.classIds[0] || 'CLASS_TEST';

    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const submission: ExamSubmission = {
      id: `sub_${Date.now()}`,
      examId: exam.id,
      examTitle: exam.title,
      studentId,
      studentName,
      studentCode,
      classId,
      score: scoreResult.totalScore,
      maxScore: 1000,
      isPassed: scoreResult.isPassed, // >= 950 điểm
      submittedAt: now.toISOString(),
      dateKey,
      timeSpentSeconds,
      attemptNumber,
      isPractice: exam.isPracticeTest,
      isTeacherTesting,
      studentAnswers: answers,
      questionResults: scoreResult.questionResults,
      questionsSnapshot: shuffledQuestions,
      violationCount,
      violationLogs: violationLogs.length > 0 ? violationLogs : undefined,
    };

    setSubmissionResult(submission);
    setIsSubmitting(false);
    setShowConfirmSubmit(false);
    onSubmitSuccess(submission);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Đếm số câu đã trả lời
  const answeredCount = shuffledQuestions.filter((q) => {
    const ans = answers[q.id];
    if (ans === undefined || ans === null) return false;
    if (Array.isArray(ans)) return ans.length > 0;
    if (typeof ans === 'object') return Object.keys(ans).length > 0;
    return true;
  }).length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100 select-none animate-in fade-in"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* ================= MODAL CẢNH BÁO VI PHẠM AN NINH PHÒNG THI ================= */}
      {showViolationWarning && !isTeacherTesting && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-7 text-slate-900 border-2 border-red-500 relative overflow-hidden">
            {/* Top red warning stripe */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-red-600" />

            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200 shadow-xs">
              <ShieldAlert className="w-9 h-9 animate-pulse" />
            </div>

            <div className="text-center">
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 mb-2">
                Hệ Thống Giám Sát Phòng Thi
              </span>
              <h3 className="text-lg sm:text-xl font-black text-red-600 uppercase tracking-tight">
                Cảnh Báo Vi Phạm Quy Chế Thi!
              </h3>
            </div>

            {/* Chi tiết vi phạm */}
            <div className="mt-4 p-3.5 bg-red-50/90 rounded-2xl border border-red-200 text-xs space-y-2">
              <div className="flex items-start gap-2 text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-red-800">Hành vi vi phạm vừa phát hiện:</span>
                  <div className="font-mono text-red-700 font-semibold mt-0.5">
                    {currentViolationReason || 'Phát hiện thao tác vi phạm quy chế thi'}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-red-200/80 flex items-center justify-between font-mono text-xs">
                <span className="text-red-800 font-semibold">Tổng số lần vi phạm đã ghi nhận:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-black text-sm">
                  {violationCount} lần
                </span>
              </div>
            </div>

            {/* Thông báo nhắc nhở quan trọng */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Bài thi KHÔNG tự động nộp bài!</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Bạn vẫn có thể tiếp tục làm bài thi bình thường. Tuy nhiên, <strong>toàn bộ số lần và chi tiết vi phạm</strong> (chuột phải, F12, rời màn hình...) đã được hệ thống lưu lại và <strong>sẽ hiển thị trực tiếp cho Giáo Viên xem</strong> khi chấm thi để đánh giá.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowViolationWarning(false)}
              className="mt-5 w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Tôi Đã Hiểu & Tiếp Tục Làm Bài</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL XÁC NHẬN NỘP BÀI SỚM ================= */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in-95">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-slate-900">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-600" />
              <span>Xác Nhận Nộp Bài Thi</span>
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              Bạn đã hoàn thành <strong>{answeredCount}/{totalQuestions}</strong> câu hỏi. Bạn có chắc chắn muốn nộp bài ngay bây giờ?
            </p>
            {answeredCount < totalQuestions && (
              <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
                ⚠️ Lưu ý: Vẫn còn <strong>{totalQuestions - answeredCount}</strong> câu hỏi bạn chưa chọn đáp án!
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Tiếp Tục Làm Bài
              </button>
              <button
                type="button"
                onClick={() => handlePerformSubmission()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Nộp Bài Ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL HIỂN THỊ KẾT QUẢ SAU KHI NỘP BÀI ================= */}
      {submissionResult && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden text-slate-900 border border-slate-200">
            <div
              className={`p-6 text-white text-center ${
                submissionResult.isPassed
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : 'bg-gradient-to-r from-amber-600 to-red-600'
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center mx-auto mb-3">
                <Award className="w-9 h-9 text-white" />
              </div>
              <h2 className="text-2xl font-black tracking-wide">
                {submissionResult.isPassed ? 'CHÚC MỪNG BẠN ĐÃ ĐẠT!' : 'BÀI THI CHƯA ĐẠT CHUẨN'}
              </h2>
              <p className="text-xs text-white/90 mt-1">
                Điểm chuẩn khảo thí: <strong>950 / 1000 điểm</strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Điểm Số Của Bạn
                </div>
                <div
                  className={`text-5xl font-black font-mono my-1 ${
                    submissionResult.isPassed ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {submissionResult.score}{' '}
                  <span className="text-xl text-slate-400 font-normal">/ 1000</span>
                </div>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold font-mono">
                  {submissionResult.isPassed ? (
                    <span className="text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                      ✓ ĐẠT CHUẨN CHỨNG CHỈ (≥ 950đ)
                    </span>
                  ) : (
                    <span className="text-red-700 bg-red-100 px-3 py-1 rounded-full">
                      ✕ CHƯA ĐẠT CHUẨN (&lt; 950đ)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Thời gian làm bài:</span>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">
                    {Math.floor(submissionResult.timeSpentSeconds / 60)} phút{' '}
                    {submissionResult.timeSpentSeconds % 60} giây
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${submissionResult.violationCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={submissionResult.violationCount > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                    Số lần vi phạm quy chế:
                  </span>
                  <div className={`font-bold text-sm mt-0.5 ${submissionResult.violationCount > 0 ? 'text-red-700 font-mono' : 'text-slate-800'}`}>
                    {submissionResult.violationCount > 0 ? `⚠️ ${submissionResult.violationCount} lần (đã báo cho GV)` : '0 lần (Hợp lệ)'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {exam.allowReviewAnswers && onReviewAnswers && (
                  <button
                    type="button"
                    onClick={() => {
                      onReviewAnswers(submissionResult);
                    }}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Xem Lại Đáp Án Chi Tiết</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-md transition-all cursor-pointer text-center"
                >
                  Hoàn Tất & Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= THANH TIÊU ĐỀ PHÒNG THI ================= */}
      <header className="h-16 px-4 sm:px-6 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
            IT
          </div>
          <div className="truncate">
            <h2 className="text-sm font-bold text-white truncate">{exam.title}</h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{exam.subject}</span>
              <span>•</span>
              <span>Thang điểm: 1000đ (Đạt: 950đ)</span>
              {exam.isPracticeTest && (
                <span className="px-2 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                  Thi Thử Ngẫu Nhiên
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Đồng hồ đếm ngược hoặc nhãn thử nghiệm GV */}
        <div className="flex items-center gap-2 sm:gap-4">
          {violationCount > 0 && !isTeacherTesting && (
            <button
              type="button"
              onClick={() => setShowViolationWarning(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-500/60 text-red-300 hover:bg-red-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer animate-pulse"
              title="Nhấn để xem chi tiết vi phạm quy chế"
            >
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span className="hidden xs:inline">Vi phạm:</span>
              <span>{violationCount} lần</span>
            </button>
          )}

          {isTeacherTesting ? (
            <div className="px-3.5 py-1.5 rounded-full bg-purple-500/20 border border-purple-400 text-purple-300 text-xs font-bold flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Chế độ GV: KHÔNG TÍNH THỜI GIAN LÀM BÀI</span>
            </div>
          ) : (
            <div
              className={`px-3 sm:px-4 py-1.5 rounded-full border font-mono text-sm font-bold flex items-center gap-2 ${
                timeRemaining < 300
                  ? 'bg-red-500/20 border-red-500 text-red-300 animate-pulse'
                  : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(timeRemaining)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowConfirmSubmit(true)}
            className="px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Nộp Bài ({answeredCount}/{totalQuestions})</span>
          </button>
        </div>
      </header>

      {/* Dải thông báo vi phạm màu đỏ luôn hiển thị nhắc nhở nếu có vi phạm */}
      {violationCount > 0 && !isTeacherTesting && (
        <div className="bg-red-950/90 border-b border-red-800/80 px-4 sm:px-6 py-2 text-xs flex items-center justify-between text-red-200 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="truncate">
              <strong>Cảnh báo quy chế:</strong> Đã ghi nhận <strong className="text-red-300">{violationCount} lần vi phạm</strong> (chuột phải / F12 / rời màn hình). Số lần vi phạm này sẽ được lưu và báo cho Giáo Viên xem.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowViolationWarning(true)}
            className="text-[11px] font-bold text-red-300 hover:text-white underline cursor-pointer shrink-0 ml-3"
          >
            Xem nhắc nhở
          </button>
        </div>
      )}

      {/* ================= NỘI DUNG CHÍNH LÀM BÀI ================= */}
      <div className="flex-1 flex overflow-hidden">
        {/* CỘT TRÁI: NỘI DUNG CÂU HỎI (75%) */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6">
          {currentQ ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Header câu hỏi */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs">
                  Câu hỏi {currentIndex + 1} / {totalQuestions}
                </span>
                <span className="text-xs text-slate-400 uppercase tracking-wider">
                  {currentQ.type === 'single_choice' && 'Chọn 1 đáp án đúng'}
                  {currentQ.type === 'multiple_choice' &&
                    `Chọn ${currentQ.correctOptionIds?.length || 2} đáp án đúng`}
                  {currentQ.type === 'matching' && 'Ghép đôi tương ứng'}
                  {currentQ.type === 'ordering' && 'Sắp xếp thứ tự'}
                  {currentQ.type === 'true_false' && 'Đúng / Sai'}
                  {currentQ.type === 'hotspot' && 'Chọn vị trí trên hình ảnh'}
                  {currentQ.type === 'fill_blank' && 'Chọn từ điền vào chỗ trống'}
                </span>
              </div>

              {/* Nội dung câu hỏi (Text) */}
              <div className="text-base sm:text-lg font-semibold text-white leading-relaxed">
                {currentQ.title}
              </div>

              {/* Phương tiện bổ trợ: Ảnh hoặc Video nếu có */}
              {currentQ.mediaType === 'image' && currentQ.mediaUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800 p-2">
                  <img
                    src={currentQ.mediaUrl}
                    alt="Hình ảnh câu hỏi"
                    className="max-h-72 mx-auto object-contain rounded-lg"
                  />
                </div>
              )}

              {currentQ.mediaType === 'video' && currentQ.mediaUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800 p-2">
                  {currentQ.mediaUrl.includes('youtube.com') || currentQ.mediaUrl.includes('youtu.be') ? (
                    <iframe
                      src={currentQ.mediaUrl.replace('watch?v=', 'embed/')}
                      title="Video câu hỏi"
                      className="w-full aspect-video rounded-lg"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video src={currentQ.mediaUrl} controls className="w-full rounded-lg max-h-72" />
                  )}
                </div>
              )}

              {/* ================= GIAO DIỆN TRẢ LỜI CHO TỪNG DẠNG CÂU HỎI ================= */}

              {/* A. CHỌN 1 ĐÁP ÁN (SINGLE CHOICE) */}
              {currentQ.type === 'single_choice' && currentQ.options && (
                <div className="space-y-3">
                  {currentQ.options.map((opt, oIdx) => {
                    const isSelected = answers[currentQ.id] === opt.id;
                    const charLabel = String.fromCharCode(65 + oIdx);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => updateAnswer(currentQ.id, opt.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                          isSelected
                            ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-md'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {charLabel}
                        </div>
                        <div className="flex-1 text-sm font-medium">
                          {opt.text}
                          {opt.imageUrl && (
                            <img
                              src={opt.imageUrl}
                              alt={`Đáp án ${charLabel}`}
                              className="mt-2 max-h-40 object-contain rounded border border-slate-700"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* B. CHỌN NHIỀU ĐÁP ÁN (MULTIPLE CHOICE - SỐ LƯỢNG BẰNG SỐ ĐÁP ÁN ĐÚNG CỦA GV) */}
              {currentQ.type === 'multiple_choice' && currentQ.options && (
                <div className="space-y-3">
                  <div className="text-xs text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30">
                    ℹ️ Bạn cần chọn chính xác <strong>{currentQ.correctOptionIds?.length || 2}</strong> đáp án đúng.
                    (Đã chọn: {(answers[currentQ.id] || []).length}/{currentQ.correctOptionIds?.length || 2})
                  </div>
                  {currentQ.options.map((opt, oIdx) => {
                    const currentList: string[] = answers[currentQ.id] || [];
                    const isSelected = currentList.includes(opt.id);
                    const charLabel = String.fromCharCode(65 + oIdx);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleToggleMultipleChoice(currentQ, opt.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                          isSelected
                            ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-md'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-emerald-500 text-white'
                              : 'border border-slate-600 bg-slate-700 text-slate-300'
                          }`}
                        >
                          {isSelected ? '✓' : charLabel}
                        </div>
                        <div className="flex-1 text-sm font-medium">
                          {opt.text}
                          {opt.imageUrl && (
                            <img
                              src={opt.imageUrl}
                              alt={`Đáp án ${charLabel}`}
                              className="mt-2 max-h-40 object-contain rounded border border-slate-700"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* C. GHÉP ĐÔI (MATCHING - DÙNG CHUỘT KÉO ĐÁP ÁN Ở CỘT A SANG CỘT B) */}
              {currentQ.type === 'matching' && currentQ.matchingPairs && (
                <div className="space-y-4">
                  {/* Thanh hướng dẫn và trạng thái */}
                  <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-700/50 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-indigo-200">
                      <MousePointer className="w-4 h-4 text-indigo-400 shrink-0 animate-pulse" />
                      <span>
                        <strong>Cách làm bài:</strong> Dùng chuột <strong>kéo đáp án ở Cột A</strong> rồi <strong>thả sang ô tương ứng ở Cột B</strong> (hoặc nhấp chọn thẻ A rồi nhấp ô B).
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Đếm số cặp đã ghép */}
                      {(() => {
                        const matches: Record<string, string> = answers[currentQ.id] || {};
                        const matchedCount = Object.keys(matches).length;
                        const total = currentQ.matchingPairs.length;
                        return (
                          <span
                            className={`px-3 py-1 rounded-xl font-bold font-mono text-xs border ${
                              matchedCount === total
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            Đã ghép: {matchedCount}/{total} cặp
                          </span>
                        );
                      })()}

                      {/* Nút làm lại */}
                      {Object.keys(answers[currentQ.id] || {}).length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleResetMatches(currentQ.id)}
                          className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Xóa tất cả các cặp đã ghép để làm lại"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Làm lại</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lưới 2 cột: Cột A bên trái (kéo) và Cột B bên phải (ô nhận thả) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* CỘT A (Nội dung vế A - Dùng chuột kéo từ đây) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <span>CỘT A (KÉO TỪ ĐÂY)</span>
                        <span className="text-[11px] text-slate-500 font-normal">Kéo chuột hoặc Nhấp chọn</span>
                      </div>

                      <div className="space-y-2.5">
                        {currentQ.matchingPairs.map((pair, pIdx) => {
                          const matches: Record<string, string> = answers[currentQ.id] || {};
                          const matchedRightId = matches[pair.id];
                          const rightItems = (currentQ.shuffledRightPairs && currentQ.shuffledRightPairs.length > 0 
                            ? currentQ.shuffledRightPairs 
                            : currentQ.matchingPairs) || [];
                          const rightItemIndex = rightItems.findIndex((r) => r.id === matchedRightId);
                          const isMatched = !!matchedRightId;
                          const isSelectedForClick = selectedLeftIdForClick === pair.id;
                          const isBeingDragged = draggedLeftPairId === pair.id;

                          return (
                            <div
                              key={pair.id}
                              draggable={true}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', pair.id);
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggedLeftPairId(pair.id);
                              }}
                              onDragEnd={() => {
                                setDraggedLeftPairId(null);
                                setDragOverRightId(null);
                              }}
                              onClick={() => {
                                if (isSelectedForClick) {
                                  setSelectedLeftIdForClick(null);
                                } else {
                                  setSelectedLeftIdForClick(pair.id);
                                }
                              }}
                              className={`p-3.5 rounded-2xl border transition-all cursor-grab active:cursor-grabbing select-none relative group ${
                                isSelectedForClick
                                  ? 'bg-amber-950/40 border-amber-400 ring-2 ring-amber-400 shadow-lg'
                                  : isMatched
                                  ? 'bg-indigo-950/30 border-indigo-500/60 hover:border-indigo-400'
                                  : 'bg-slate-800/90 border-slate-700 hover:border-indigo-500 hover:bg-slate-800'
                              } ${isBeingDragged ? 'opacity-40 scale-95' : ''}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0">
                                  <GripVertical className="w-5 h-5" />
                                </div>
                                <span className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                                  A{pIdx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-100 leading-snug">
                                    {pair.leftText}
                                  </p>
                                  {pair.leftImageUrl && (
                                    <img
                                      src={pair.leftImageUrl}
                                      alt="Hình ảnh ghép"
                                      className="mt-2 max-h-24 rounded-lg border border-slate-700 object-cover"
                                    />
                                  )}
                                  
                                  {/* Chỉ báo trạng thái đã ghép */}
                                  {isMatched && (
                                    <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-slate-700/60">
                                      <span className="font-medium text-emerald-400 flex items-center gap-1">
                                        <Link2 className="w-3.5 h-3.5" />
                                        <span>Đã ghép với: <strong>B{rightItemIndex + 1}</strong></span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDisconnectPair(currentQ.id, pair.id);
                                        }}
                                        className="text-[11px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded-lg bg-red-950/40 border border-red-800/40 hover:bg-red-900/50 cursor-pointer transition-colors"
                                      >
                                        Hủy ghép
                                      </button>
                                    </div>
                                  )}

                                  {isSelectedForClick && !isMatched && (
                                    <div className="mt-2 text-[11px] text-amber-300 font-semibold flex items-center gap-1 animate-pulse">
                                      <span>👉 Đã chọn thẻ này. Nhấp tiếp vào 1 ô ở Cột B để kết nối!</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* CỘT B (Nội dung vế B - Ô đích nhận thả - ĐÃ ĐẢO THỨ TỰ ĐÁP ÁN) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <span>CỘT B (THẢ VÀO ĐÂY)</span>
                        <span className="text-[11px] text-emerald-400 font-mono font-medium">Đã đảo đáp án</span>
                      </div>

                      <div className="space-y-2.5">
                        {(() => {
                          const rightItems = (currentQ.shuffledRightPairs && currentQ.shuffledRightPairs.length > 0 
                            ? currentQ.shuffledRightPairs 
                            : currentQ.matchingPairs) || [];
                          const matches: Record<string, string> = answers[currentQ.id] || {};
                          
                          // Tạo map ngược: rightId -> leftPair
                          const reverseMap: Record<string, { leftPair: any; leftIndex: number }> = {};
                          currentQ.matchingPairs.forEach((p, idx) => {
                            const rId = matches[p.id];
                            if (rId) {
                              reverseMap[rId] = { leftPair: p, leftIndex: idx };
                            }
                          });

                          return rightItems.map((rightP, rIdx) => {
                            const connected = reverseMap[rightP.id];
                            const isDragOver = dragOverRightId === rightP.id;
                            const isClickTarget = !!selectedLeftIdForClick;

                            return (
                              <div
                                key={rightP.id}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (dragOverRightId !== rightP.id) {
                                    setDragOverRightId(rightP.id);
                                  }
                                }}
                                onDragLeave={() => {
                                  if (dragOverRightId === rightP.id) {
                                    setDragOverRightId(null);
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const droppedLeftId = e.dataTransfer.getData('text/plain') || draggedLeftPairId;
                                  if (droppedLeftId) {
                                    handleConnectPair(currentQ.id, droppedLeftId, rightP.id);
                                  }
                                  setDraggedLeftPairId(null);
                                  setDragOverRightId(null);
                                }}
                                onClick={() => {
                                  if (selectedLeftIdForClick) {
                                    handleConnectPair(currentQ.id, selectedLeftIdForClick, rightP.id);
                                  }
                                }}
                                className={`p-3.5 rounded-2xl border transition-all ${
                                  isDragOver
                                    ? 'bg-emerald-950/60 border-emerald-400 ring-2 ring-emerald-400 scale-[1.02] shadow-xl'
                                    : connected
                                    ? 'bg-slate-800/95 border-emerald-500/70 shadow-sm'
                                    : isClickTarget
                                    ? 'bg-slate-800 border-amber-500/50 hover:border-amber-400 hover:bg-slate-800/90 cursor-pointer ring-1 ring-amber-500/30'
                                    : 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600'
                                }`}
                              >
                                {/* Header của ô Cột B */}
                                <div className="flex items-start gap-2.5">
                                  <span className="w-6 h-6 rounded-lg bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                                    B{rIdx + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-100 leading-snug">
                                      {rightP.rightText}
                                    </p>
                                    {rightP.rightImageUrl && (
                                      <img
                                        src={rightP.rightImageUrl}
                                        alt="Hình ảnh minh họa"
                                        className="mt-2 max-h-24 rounded-lg border border-slate-700 object-cover"
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Vùng hiển thị thẻ A đã thả vào đây */}
                                <div className="mt-3 pt-2.5 border-t border-slate-700/70">
                                  {connected ? (
                                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between gap-2 text-xs animate-in zoom-in-95">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                          A{connected.leftIndex + 1}
                                        </span>
                                        <span className="text-emerald-200 font-medium truncate">
                                          {connected.leftPair.leftText}
                                        </span>
                                        {connected.leftPair.leftImageUrl && (
                                          <img
                                            src={connected.leftPair.leftImageUrl}
                                            alt="Ảnh"
                                            className="h-6 w-8 object-cover rounded border border-emerald-700 shrink-0"
                                          />
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDisconnectPair(currentQ.id, connected.leftPair.id);
                                        }}
                                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                                        title="Gỡ bỏ liên kết"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className={`py-3 px-3 rounded-xl border border-dashed text-center text-xs transition-colors flex items-center justify-center gap-2 ${
                                        isDragOver
                                          ? 'border-emerald-400 bg-emerald-900/30 text-emerald-200 font-bold'
                                          : isClickTarget
                                          ? 'border-amber-400/60 bg-amber-950/20 text-amber-300 font-semibold'
                                          : 'border-slate-600/60 text-slate-400 bg-slate-900/40'
                                      }`}
                                    >
                                      <MousePointer className="w-3.5 h-3.5 opacity-60" />
                                      <span>
                                        {isDragOver
                                          ? 'Thả chuột vào đây để ghép'
                                          : isClickTarget
                                          ? 'Nhấp vào đây để ghép với thẻ đang chọn'
                                          : 'Kéo đáp án ở Cột A thả vào đây'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* D. SẮP XẾP THỨ TỰ (ORDERING) */}
              {currentQ.type === 'ordering' && currentQ.orderingItems && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Sử dụng các nút mũi tên để điều chỉnh các mục theo đúng thứ tự logic từ trên xuống dưới:
                  </p>
                  {(() => {
                    const currentOrder: string[] =
                      answers[currentQ.id] || currentQ.orderingItems.map((i) => i.id);
                    const itemMap = new Map(currentQ.orderingItems.map((i) => [i.id, i]));

                    return currentOrder.map((itemId, idx) => {
                      const item = itemMap.get(itemId);
                      if (!item) return null;
                      return (
                        <div
                          key={itemId}
                          className="p-3.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-3 shadow-xs hover:border-slate-600 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium text-slate-200">{item.text}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveOrderItem(currentQ.id, idx, idx - 1)}
                              className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                              title="Di chuyển lên trên"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === currentOrder.length - 1}
                              onClick={() => handleMoveOrderItem(currentQ.id, idx, idx + 1)}
                              className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                              title="Di chuyển xuống dưới"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* E. ĐÚNG / SAI (TRUE / FALSE VỚI TIÊU ĐỀ TÙY BIẾN - ĐẢO ĐÁP ÁN) */}
              {currentQ.type === 'true_false' && currentQ.tfStatements && (
                <div className="space-y-3">
                  <div className="text-xs text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 flex items-center justify-between gap-2">
                    <span>ℹ️ <strong>Lưu ý:</strong> Thứ tự các nhận định và các cột lựa chọn đã được đảo ngẫu nhiên.</span>
                    <span className="text-[11px] font-mono text-amber-400">Đã đảo đáp án</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-700">
                    <table className="w-full text-left text-xs sm:text-sm">
                      {(() => {
                        const columns = currentQ.shuffledTfColumns || ['true', 'false'];
                        return (
                          <>
                            <thead className="bg-slate-800 text-slate-400 font-bold border-b border-slate-700 uppercase text-[11px]">
                              <tr>
                                <th className="p-3 w-12 text-center">STT</th>
                                <th className="p-3">Nội dung nhận định / phát biểu</th>
                                {columns.map((colKey) => (
                                  <th
                                    key={colKey}
                                    className={`p-3 w-28 text-center font-bold ${
                                      colKey === 'true' ? 'text-emerald-400 bg-emerald-950/20' : 'text-red-400 bg-red-950/20'
                                    }`}
                                  >
                                    {colKey === 'true'
                                      ? currentQ.trueLabel || 'Đúng'
                                      : currentQ.falseLabel || 'Sai'}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/60 bg-slate-800/40">
                              {currentQ.tfStatements.map((st, idx) => {
                                const userVal = (answers[currentQ.id] || {})[st.id];
                                return (
                                  <tr key={st.id} className="hover:bg-slate-800 transition-colors">
                                    <td className="p-3 text-center text-slate-400 font-mono font-bold">
                                      {idx + 1}
                                    </td>
                                    <td className="p-3 text-slate-200">{st.statement}</td>
                                    {columns.map((colKey) => {
                                      const isTrueOption = colKey === 'true';
                                      const isChecked = userVal === isTrueOption;
                                      return (
                                        <td key={colKey} className="p-3 text-center">
                                          <label className="flex items-center justify-center cursor-pointer p-1">
                                            <input
                                              type="radio"
                                              name={`tf_${currentQ.id}_${st.id}`}
                                              checked={isChecked}
                                              onChange={() =>
                                                handleUpdateTrueFalse(currentQ.id, st.id, isTrueOption)
                                              }
                                              className={`w-4 h-4 cursor-pointer ${
                                                isTrueOption
                                                  ? 'text-emerald-600 focus:ring-emerald-500'
                                                  : 'text-red-600 focus:ring-red-500'
                                              }`}
                                            />
                                          </label>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </>
                        );
                      })()}
                    </table>
                  </div>
                </div>
              )}

              {/* F. CHỌN TRÊN HÌNH ẢNH (HOTSPOT) */}
              {currentQ.type === 'hotspot' && currentQ.hotspotImageUrl && (
                <div className="space-y-3">
                  <HotspotCanvas
                    imageUrl={currentQ.hotspotImageUrl}
                    isStudent={true}
                    studentClicks={answers[currentQ.id] || []}
                    onStudentClicksChange={(clicks) => updateAnswer(currentQ.id, clicks)}
                    maxClicks={currentQ.hotspotRegions?.length || 1}
                  />
                </div>
              )}

              {/* G. ĐIỀN VÀO CHỖ TRỐNG (FILL IN THE BLANKS WITH DROPDOWN - ĐẢO ĐÁP ÁN) */}
              {currentQ.type === 'fill_blank' && currentQ.fillBlankTemplate && (
                <div className="space-y-3">
                  <div className="text-xs text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/30 flex items-center gap-2">
                    <span className="font-bold">ℹ️ Hướng dẫn:</span>
                    <span>Hãy chọn đáp án thích hợp từ danh sách thả xuống cho từng vị trí ô trống (các đáp án đã được xáo trộn ngẫu nhiên).</span>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-800 border border-slate-700 leading-loose text-slate-200 text-sm sm:text-base shadow-sm">
                    {(() => {
                      const template = currentQ.fillBlankTemplate;
                      const blanks = currentQ.fillBlankItems || [];
                      const blankMap = new Map(blanks.map((b) => [b.placeholderCode, b]));
                      const parts = template.split(/(\[b\d+\])/g);

                      return parts.map((part, pIdx) => {
                        if (blankMap.has(part)) {
                          const blank = blankMap.get(part)!;
                          const currentVal = (answers[currentQ.id] || {})[blank.id] || '';
                          return (
                            <span key={pIdx} className="inline-block mx-1.5 my-1 align-middle">
                              <select
                                value={currentVal}
                                onChange={(e) =>
                                  handleUpdateFillBlank(currentQ.id, blank.id, e.target.value)
                                }
                                className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-semibold transition-all focus:ring-2 focus:ring-emerald-400 cursor-pointer ${
                                  currentVal
                                    ? 'bg-emerald-950/60 border-emerald-400 text-emerald-200 shadow-sm'
                                    : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                <option value="">-- Chọn đáp án --</option>
                                {blank.options.map((opt, oIdx) => (
                                  <option key={oIdx} value={opt} className="bg-slate-900 text-white">
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </span>
                          );
                        }
                        return <span key={pIdx}>{part}</span>;
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Thanh điều hướng câu trước / câu sau */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-700">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Câu Trước</span>
                </button>

                <span className="text-xs text-slate-400 font-mono">
                  {currentIndex + 1} / {totalQuestions}
                </span>

                <button
                  type="button"
                  disabled={currentIndex === totalQuestions - 1}
                  onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Câu Kế Tiếp</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400">
              Đề thi chưa có câu hỏi nào.
            </div>
          )}
        </main>

        {/* CỘT PHẢI: BẢNG TIẾN ĐỘ CÂU HỎI (25%) */}
        <aside className="w-72 bg-slate-800/80 border-l border-slate-700 p-5 flex flex-col justify-between hidden md:flex">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Danh Sách Câu Hỏi
              </span>
              <span className="text-xs font-bold text-emerald-400 font-mono">
                {answeredCount}/{totalQuestions} đã làm
              </span>
            </div>

            {/* Grid câu hỏi */}
            <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {shuffledQuestions.map((q, qIdx) => {
                const ans = answers[q.id];
                const isAnswered =
                  ans !== undefined &&
                  ans !== null &&
                  (Array.isArray(ans)
                    ? ans.length > 0
                    : typeof ans === 'object'
                    ? Object.keys(ans).length > 0
                    : true);
                const isCurrent = currentIndex === qIdx;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(qIdx)}
                    className={`h-9 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                      isCurrent
                        ? 'ring-2 ring-emerald-400 bg-emerald-600 text-white shadow'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700 border border-slate-600/40'
                    }`}
                  >
                    {qIdx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-2 pt-4 border-t border-slate-700 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-emerald-500/20 border border-emerald-500/40"></span>
                <span>Đã trả lời ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-slate-700/60 border border-slate-600/40"></span>
                <span>Chưa trả lời ({totalQuestions - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-emerald-600 ring-2 ring-emerald-400"></span>
                <span>Đang chọn xem</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={() => setShowConfirmSubmit(true)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Nộp Bài Thi Ngay</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
