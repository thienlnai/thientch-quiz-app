-- =========================================================================
-- SQL SCHEMA FOR SUPABASE - HỆ THỐNG KHẢO THÍ THIENTCH
-- =========================================================================
-- Hướng dẫn: Mở Supabase Dashboard -> Project của bạn -> SQL Editor -> Dán toàn bộ script này và nhấn 'Run'.

-- 1. BẢNG TRƯỜNG HỌC (schools)
CREATE TABLE IF NOT EXISTS public.schools (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  level TEXT DEFAULT 'highschool',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG LỚP HỌC (classes)
CREATE TABLE IF NOT EXISTS public.classes (
  id TEXT PRIMARY KEY,
  "schoolId" TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT,
  "schoolYear" TEXT,
  "homeroomTeacher" TEXT,
  room TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG HỌC SINH (students)
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "classId" TEXT,
  "studentCode" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "dateOfBirth" TEXT,
  gender TEXT DEFAULT 'other',
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  note TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG TÀI KHOẢN NGƯỜI DÙNG (users: Admin & Giáo Viên)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subjects TEXT,
  "schoolId" TEXT,
  "classIds" JSONB DEFAULT '[]'::jsonb,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  "lastLogin" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BẢNG ĐỀ THI (exams - hỗ trợ 7 dạng câu hỏi)
CREATE TABLE IF NOT EXISTS public.exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  grade TEXT,
  "creatorId" TEXT,
  "creatorName" TEXT,
  "classIds" JSONB DEFAULT '[]'::jsonb,
  "durationMinutes" INTEGER DEFAULT 45,
  "totalScore" INTEGER DEFAULT 1000,
  "passingScore" INTEGER DEFAULT 950,
  status TEXT DEFAULT 'published',
  "allowReviewAnswers" BOOLEAN DEFAULT TRUE,
  "isPracticeTest" BOOLEAN DEFAULT FALSE,
  "practiceRandomCount" INTEGER DEFAULT 0,
  questions JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BẢNG KẾT QUẢ NỘP BÀI (submissions - Tối ưu siêu nhẹ ~0.8 KB/bài, KHÔNG lưu questionsSnapshot)
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL,
  "examTitle" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "studentCode" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  "maxScore" INTEGER DEFAULT 1000,
  "isPassed" BOOLEAN DEFAULT FALSE,
  "submittedAt" TIMESTAMPTZ DEFAULT NOW(),
  "dateKey" TEXT,
  "timeSpentSeconds" INTEGER DEFAULT 0,
  "attemptNumber" INTEGER DEFAULT 1,
  "isPractice" BOOLEAN DEFAULT FALSE,
  "isTeacherTesting" BOOLEAN DEFAULT FALSE,
  "studentAnswers" JSONB DEFAULT '{}'::jsonb,
  "questionResults" JSONB DEFAULT '{}'::jsonb,
  "questionOrder" JSONB DEFAULT '[]'::jsonb,
  "violationCount" INTEGER DEFAULT 0,
  "violationLogs" JSONB DEFAULT '[]'::jsonb
);

-- 7. BẢNG NHẬT KÝ HOẠT ĐỘNG (audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT,
  actor TEXT,
  details JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Bật Row Level Security (RLS) cho tất cả các bảng
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Chính sách RLS cho phép truy cập với Anon Key
CREATE POLICY "Allow public all on schools" ON public.schools FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on classes" ON public.classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on students" ON public.students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on exams" ON public.exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on submissions" ON public.submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- Bật Realtime trên Supabase cho các bảng
ALTER PUBLICATION supabase_realtime ADD TABLE public.schools;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
