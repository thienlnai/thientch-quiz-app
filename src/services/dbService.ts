import { supabase, handleSupabaseError, OperationType, isConfigured } from '../supabase.ts';
import { School, SchoolClass, Student, UserAccount, Exam, ExamSubmission } from '../types/index.ts';

// Initial admin password required specifically by the user: 8653564@Thien
export const INITIAL_ADMIN_PASSWORD = '8653564@Thien';

// Table names in Supabase
const SCHOOLS_TABLE = 'schools';
const CLASSES_TABLE = 'classes';
const STUDENTS_TABLE = 'students';
const USERS_TABLE = 'users';
const EXAMS_TABLE = 'exams';
const SUBMISSIONS_TABLE = 'submissions';
const AUDIT_LOGS_TABLE = 'audit_logs';

// Local storage backup keys for seamless offline/hybrid operation
const STORAGE_KEYS = {
  schools: 'thientch_supabase_schools',
  classes: 'thientch_supabase_classes',
  students: 'thientch_supabase_students',
  users: 'thientch_supabase_users',
  exams: 'thientch_supabase_exams',
  submissions: 'thientch_supabase_submissions',
};

// In-memory caches to guarantee snappy UI reactivity
function getInitialData<T>(key: string, defaultValue: T[]): T[] {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveLocalData<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('[Cache] Could not persist to localStorage:', err);
  }
}

let localSchools: School[] = getInitialData(STORAGE_KEYS.schools, []);
let localClasses: SchoolClass[] = getInitialData(STORAGE_KEYS.classes, []);
let localStudents: Student[] = getInitialData(STORAGE_KEYS.students, []);
let localUsers: UserAccount[] = getInitialData(STORAGE_KEYS.users, []);
let localExams: Exam[] = getInitialData(STORAGE_KEYS.exams, []);
let localSubmissions: ExamSubmission[] = getInitialData(STORAGE_KEYS.submissions, []);

// Subscriber listeners
type Listener<T> = (data: T[]) => void;
const schoolListeners = new Set<Listener<School>>();
const classListeners = new Set<Listener<SchoolClass>>();
const studentListeners = new Set<Listener<Student>>();
const userListeners = new Set<Listener<UserAccount>>();
const examListeners = new Set<Listener<Exam>>();
const submissionListeners = new Set<Listener<ExamSubmission>>();

function notifySchools() {
  saveLocalData(STORAGE_KEYS.schools, localSchools);
  schoolListeners.forEach((fn) => fn([...localSchools]));
}
function notifyClasses() {
  saveLocalData(STORAGE_KEYS.classes, localClasses);
  classListeners.forEach((fn) => fn([...localClasses]));
}
function notifyStudents() {
  saveLocalData(STORAGE_KEYS.students, localStudents);
  studentListeners.forEach((fn) => fn([...localStudents]));
}
function notifyUsers() {
  saveLocalData(STORAGE_KEYS.users, localUsers);
  userListeners.forEach((fn) => fn([...localUsers]));
}
function notifyExams() {
  saveLocalData(STORAGE_KEYS.exams, localExams);
  examListeners.forEach((fn) => fn([...localExams]));
}
function notifySubmissions() {
  saveLocalData(STORAGE_KEYS.submissions, localSubmissions);
  submissionListeners.forEach((fn) => fn([...localSubmissions]));
}

/**
 * Recursively cleans data before sending to database
 */
export function cleanDbData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanDbData(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = cleanDbData(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

// Backward-compatibility alias
export const cleanFirestoreData = cleanDbData;

/**
 * Xóa toàn bộ lịch sử hoạt động khỏi Supabase Database
 */
export async function purgeExistingAuditLogsFromDatabase(): Promise<number> {
  try {
    if (isConfigured) {
      const { data, error } = await supabase.from(AUDIT_LOGS_TABLE).delete().neq('id', 'placeholder');
      if (error) {
        handleSupabaseError(error, OperationType.DELETE, AUDIT_LOGS_TABLE);
      }
      return data ? (data as any[]).length : 0;
    }
    return 0;
  } catch (error) {
    console.warn('Purge audit logs:', error);
    return 0;
  }
}

// ================= SUPABASE SUBSCRIPTIONS & SYNC =================

export function subscribeSchools(onUpdate: (schools: School[]) => void) {
  schoolListeners.add(onUpdate);
  // Send current cached state immediately
  onUpdate([...localSchools]);

  // Fetch from Supabase
  if (isConfigured) {
    supabase
      .from(SCHOOLS_TABLE)
      .select('*')
      .order('createdAt', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          localSchools = data as School[];
          notifySchools();
        } else if (error) {
          handleSupabaseError(error, OperationType.GET, SCHOOLS_TABLE);
        }
      });

    // Realtime channel
    const channel = supabase
      .channel('public:schools')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: SCHOOLS_TABLE },
        () => {
          supabase
            .from(SCHOOLS_TABLE)
            .select('*')
            .order('createdAt', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) {
                localSchools = data as School[];
                notifySchools();
              }
            });
        }
      )
      .subscribe();

    return () => {
      schoolListeners.delete(onUpdate);
      supabase.removeChannel(channel);
    };
  }

  return () => {
    schoolListeners.delete(onUpdate);
  };
}

export function subscribeClasses(onUpdate: (classes: SchoolClass[]) => void) {
  classListeners.add(onUpdate);
  onUpdate([...localClasses]);

  if (isConfigured) {
    supabase
      .from(CLASSES_TABLE)
      .select('*')
      .order('createdAt', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          localClasses = data as SchoolClass[];
          notifyClasses();
        } else if (error) {
          handleSupabaseError(error, OperationType.GET, CLASSES_TABLE);
        }
      });

    const channel = supabase
      .channel('public:classes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: CLASSES_TABLE },
        () => {
          supabase
            .from(CLASSES_TABLE)
            .select('*')
            .order('createdAt', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) {
                localClasses = data as SchoolClass[];
                notifyClasses();
              }
            });
        }
      )
      .subscribe();

    return () => {
      classListeners.delete(onUpdate);
      supabase.removeChannel(channel);
    };
  }

  return () => {
    classListeners.delete(onUpdate);
  };
}

export function subscribeStudents(onUpdate: (students: Student[]) => void) {
  studentListeners.add(onUpdate);
  onUpdate([...localStudents]);

  if (isConfigured) {
    supabase
      .from(STUDENTS_TABLE)
      .select('*')
      .order('createdAt', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          localStudents = data as Student[];
          notifyStudents();
        } else if (error) {
          handleSupabaseError(error, OperationType.GET, STUDENTS_TABLE);
        }
      });

    const channel = supabase
      .channel('public:students')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: STUDENTS_TABLE },
        () => {
          supabase
            .from(STUDENTS_TABLE)
            .select('*')
            .order('createdAt', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) {
                localStudents = data as Student[];
                notifyStudents();
              }
            });
        }
      )
      .subscribe();

    return () => {
      studentListeners.delete(onUpdate);
      supabase.removeChannel(channel);
    };
  }

  return () => {
    studentListeners.delete(onUpdate);
  };
}

export function subscribeUsers(onUpdate: (users: UserAccount[]) => void) {
  userListeners.add(onUpdate);
  onUpdate([...localUsers]);

  if (isConfigured) {
    supabase
      .from(USERS_TABLE)
      .select('*')
      .order('createdAt', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          localUsers = (data as any[]).filter(
            (u) => (u.role === 'admin' || u.role === 'teacher') && !u.id?.startsWith('exam_') && !u.id?.startsWith('sub_')
          );
          notifyUsers();
        } else if (error) {
          handleSupabaseError(error, OperationType.GET, USERS_TABLE);
        }
      });

    const channel = supabase
      .channel('public:users')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: USERS_TABLE },
        () => {
          supabase
            .from(USERS_TABLE)
            .select('*')
            .order('createdAt', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) {
                localUsers = (data as any[]).filter(
                  (u) => (u.role === 'admin' || u.role === 'teacher') && !u.id?.startsWith('exam_') && !u.id?.startsWith('sub_')
                );
                notifyUsers();
              }
            });
        }
      )
      .subscribe();

    return () => {
      userListeners.delete(onUpdate);
      supabase.removeChannel(channel);
    };
  }

  return () => {
    userListeners.delete(onUpdate);
  };
}

export function subscribeExams(onUpdate: (exams: Exam[]) => void) {
  examListeners.add(onUpdate);
  onUpdate([...localExams]);

  if (isConfigured) {
    supabase
      .from(EXAMS_TABLE)
      .select('*')
      .order('createdAt', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          localExams = data as Exam[];
          localExams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          notifyExams();
        } else if (error) {
          handleSupabaseError(error, OperationType.GET, EXAMS_TABLE);
        }
      });

    const channel = supabase
      .channel('public:exams')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: EXAMS_TABLE },
        () => {
          supabase
            .from(EXAMS_TABLE)
            .select('*')
            .order('createdAt', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) {
                localExams = data as Exam[];
                localExams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                notifyExams();
              }
            });
        }
      )
      .subscribe();

    return () => {
      examListeners.delete(onUpdate);
      supabase.removeChannel(channel);
    };
  }

  return () => {
    examListeners.delete(onUpdate);
  };
}

export function subscribeSubmissions(onUpdate: (submissions: ExamSubmission[]) => void) {
  submissionListeners.add(onUpdate);
  onUpdate([...localSubmissions]);

  if (isConfigured) {
    supabase
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .order('submittedAt', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          localSubmissions = data as ExamSubmission[];
          localSubmissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
          notifySubmissions();
        } else if (error) {
          handleSupabaseError(error, OperationType.GET, SUBMISSIONS_TABLE);
        }
      });

    const channel = supabase
      .channel('public:submissions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: SUBMISSIONS_TABLE },
        () => {
          supabase
            .from(SUBMISSIONS_TABLE)
            .select('*')
            .order('submittedAt', { ascending: false })
            .then(({ data, error }) => {
              if (!error && data) {
                localSubmissions = data as ExamSubmission[];
                localSubmissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
                notifySubmissions();
              }
            });
        }
      )
      .subscribe();

    return () => {
      submissionListeners.delete(onUpdate);
      supabase.removeChannel(channel);
    };
  }

  return () => {
    submissionListeners.delete(onUpdate);
  };
}

// ================= SEED INITIAL DATA =================
export async function seedInitialDataIfNeeded(existingUsers: UserAccount[], existingSchools: School[]) {
  const now = new Date().toISOString();

  // 1. Ensure required admin account exists
  const hasAdmin = (existingUsers.length > 0 ? existingUsers : localUsers).some((u) => u.username === 'admin');
  if (!hasAdmin) {
    const adminUser: UserAccount = {
      id: 'admin_root',
      fullName: 'Quản trị viên Hệ thống (Thiện L.N)',
      username: 'admin',
      password: INITIAL_ADMIN_PASSWORD,
      email: 'admin@exam.edu.vn',
      phone: '0908 653 564',
      subjects: 'Quản trị Hệ thống Khảo thí',
      role: 'admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const teacherUser: UserAccount = {
      id: 'teacher_01',
      fullName: 'ThS. Nguyễn Văn Hùng',
      username: 'gv_nguyenvana',
      password: 'Gv@123456',
      email: 'hung.nv@lehongphong.edu.vn',
      phone: '0912 345 678',
      subjects: 'Toán học & Tin học',
      role: 'teacher',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // Update local cache
    localUsers = [adminUser, teacherUser, ...localUsers.filter((u) => u.id !== adminUser.id && u.id !== teacherUser.id)];
    notifyUsers();

    if (isConfigured) {
      try {
        await supabase.from(USERS_TABLE).upsert([adminUser, teacherUser]);
      } catch (err) {
        handleSupabaseError(err, OperationType.WRITE, USERS_TABLE);
      }
    }
  }

  // 2. Ensure initial school exists
  const currentSchools = existingSchools.length > 0 ? existingSchools : localSchools;
  if (currentSchools.length === 0) {
    const schoolId = 'sch_lhp_001';
    const initialSchool: School = {
      id: schoolId,
      code: 'THPT-LHP',
      name: 'Trường THPT Chuyên Lê Hồng Phong - TP.HCM',
      address: '235 Nguyễn Văn Cừ, Phường 4, Quận 5, TP. Hồ Chí Minh',
      phone: '028 3839 8506',
      email: 'contact@thpt-lehongphong.edu.vn',
      level: 'highschool',
      createdAt: now,
      updatedAt: now,
    };

    const class1Id = 'cls_12a1';
    const class1: SchoolClass = {
      id: class1Id,
      schoolId: schoolId,
      code: '12A1',
      name: 'Lớp 12A1 - Chuyên Toán & Khoa học Tự nhiên',
      grade: '12',
      schoolYear: '2025 - 2026',
      homeroomTeacher: 'ThS. Nguyễn Văn Hùng',
      room: 'Phòng A201',
      createdAt: now,
      updatedAt: now,
    };

    const class2Id = 'cls_11b2';
    const class2: SchoolClass = {
      id: class2Id,
      schoolId: schoolId,
      code: '11B2',
      name: 'Lớp 11B2 - Chuyên Anh ngữ Quốc tế',
      grade: '11',
      schoolYear: '2025 - 2026',
      homeroomTeacher: 'Cô Trần Mai Anh',
      room: 'Phòng B104',
      createdAt: now,
      updatedAt: now,
    };

    const student1: Student = {
      id: 'stu_120101',
      schoolId: schoolId,
      classId: class1Id,
      studentCode: 'HS120101',
      fullName: 'Trần Minh Khang',
      dateOfBirth: '2008-05-14',
      gender: 'male',
      username: 'HS1201',
      password: 'Hs@123456',
      status: 'active',
      note: 'Học sinh giỏi cấp Thành phố, SBD phòng thi số 01',
      createdAt: now,
      updatedAt: now,
    };

    const student2: Student = {
      id: 'stu_120102',
      schoolId: schoolId,
      classId: class1Id,
      studentCode: 'HS120102',
      fullName: 'Lê Phương Thảo',
      dateOfBirth: '2008-09-22',
      gender: 'female',
      username: 'HS1202',
      password: 'Hs@123456',
      status: 'active',
      note: 'Lớp phó học tập, SBD phòng thi số 02',
      createdAt: now,
      updatedAt: now,
    };

    const exam1Id = 'exam_sample_it_001';
    const sampleExam1: Exam = {
      id: exam1Id,
      title: 'Kiểm Tra Chuẩn Hóa Kiến Trúc Máy Tính & Lập Trình Cơ Bản',
      description: 'Đề thi trắc nghiệm chuẩn hóa 7 dạng câu hỏi: Chọn 1, chọn nhiều, ghép đôi, sắp xếp, đúng/sai, hotspot và điền chỗ trống.',
      subject: 'Công nghệ Thông tin',
      grade: 'Khối 12',
      creatorId: 'usr_teacher_01',
      creatorName: 'ThS. Nguyễn Văn Hùng',
      classIds: [class1Id, class2Id],
      durationMinutes: 45,
      totalScore: 1000,
      passingScore: 950,
      status: 'published',
      allowReviewAnswers: true,
      isPracticeTest: false,
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'q1',
          type: 'single_choice',
          title: 'Trong kiến trúc máy tính Von Neumann, thành phần nào chịu trách nhiệm thực thi các phép toán số học và logic?',
          mediaType: 'none',
          explanation: 'Khối ALU (Arithmetic Logic Unit) nằm trong CPU đảm nhận thực hiện toàn bộ phép toán số học và phép toán logic.',
          options: [
            { id: 'opt_1', text: 'ALU (Arithmetic Logic Unit)' },
            { id: 'opt_2', text: 'CU (Control Unit)' },
            { id: 'opt_3', text: 'Register Bus' },
            { id: 'opt_4', text: 'ROM BIOS' },
          ],
          correctOptionId: 'opt_1',
        },
        {
          id: 'q2',
          type: 'multiple_choice',
          title: 'Những phát biểu nào sau đây là ĐÚNG về bộ nhớ đệm (Cache) của bộ vi xử lý? (Chọn tất cả các phương án đúng)',
          mediaType: 'none',
          explanation: 'Cache có tốc độ nhanh hơn RAM chính và được tích hợp trực tiếp hoặc gần nhân CPU để giảm độ trễ truy xuất dữ liệu.',
          options: [
            { id: 'opt_mc_1', text: 'Cache có tốc độ truy xuất nhanh hơn bộ nhớ RAM chính' },
            { id: 'opt_mc_2', text: 'Cache L1 thường có dung lượng nhỏ hơn Cache L3 nhưng tốc độ nhanh nhất' },
            { id: 'opt_mc_3', text: 'Cache lưu trữ dữ liệu vĩnh viễn ngay cả khi tắt nguồn điện' },
            { id: 'opt_mc_4', text: 'Cache dùng để lưu tạm các dữ liệu và lệnh thường xuyên được CPU truy cập' },
          ],
          correctOptionIds: ['opt_mc_1', 'opt_mc_2', 'opt_mc_4'],
        },
        {
          id: 'q3',
          type: 'matching',
          title: 'Hãy ghép đôi mỗi thuật ngữ công nghệ thông tin ở cột bên trái với định nghĩa phù hợp nhất ở cột bên phải:',
          mediaType: 'none',
          explanation: 'Mỗi giao thức/thuật ngữ đều có vai trò cụ thể trong kiến trúc mạng và phát triển phần mềm.',
          matchingPairs: [
            { id: 'm_1', leftText: 'DNS (Domain Name System)', rightText: 'Phân giải tên miền thành địa chỉ IP mạng' },
            { id: 'm_2', leftText: 'DHCP (Dynamic Host Config)', rightText: 'Cấp phát địa chỉ IP tự động cho các thiết bị mạng' },
            { id: 'm_3', leftText: 'HTTPS (Port 443)', rightText: 'Giao thức truyền siêu văn bản an toàn mã hóa SSL/TLS' },
          ],
        },
        {
          id: 'q4',
          type: 'ordering',
          title: 'Hãy dùng chuột nắm kéo và sắp xếp các giai đoạn của quy trình phát triển phần mềm (SDLC) theo đúng trình tự chuẩn:',
          mediaType: 'none',
          explanation: 'Quy trình chuẩn: Phân tích yêu cầu -> Thiết kế hệ thống -> Viết mã lập trình -> Kiểm thử -> Triển khai và bảo trì.',
          orderingItems: [
            { id: 'ord_1', text: '1. Khảo sát & Phân tích yêu cầu bài toán' },
            { id: 'ord_2', text: '2. Thiết kế kiến trúc hệ thống và cơ sở dữ liệu' },
            { id: 'ord_3', text: '3. Lập trình và viết mã nguồn (Coding)' },
            { id: 'ord_4', text: '4. Kiểm thử phần mềm và vá lỗi (Testing & QA)' },
            { id: 'ord_5', text: '5. Đóng gói triển khai và bảo trì hệ thống' },
          ],
        },
        {
          id: 'q5',
          type: 'true_false',
          title: 'Đánh giá tính Đúng / Sai của các khẳng định sau đây về an toàn thông tin và mạng máy tính:',
          mediaType: 'none',
          trueLabel: 'Đúng',
          falseLabel: 'Sai',
          explanation: 'Mã hóa bất đối xứng dùng cặp khóa công khai - bí mật, tường lửa giúp lọc lưu lượng độc hại.',
          tfStatements: [
            { id: 'tf_1', statement: 'Mã hóa khóa công khai (RSA) sử dụng hai khóa khác nhau: Khóa công khai để mã hóa và Khóa bí mật để giải mã.', isTrue: true },
            { id: 'tf_2', statement: 'Tường lửa (Firewall) hoàn toàn ngăn chặn được 100% tất cả các loại virus và mã độc trong file tải về.', isTrue: false },
            { id: 'tf_3', statement: 'Sử dụng xác thực hai yếu tố (2FA) giúp tăng cường bảo mật đáng kể cho tài khoản người dùng.', isTrue: true },
          ],
        },
        {
          id: 'q6',
          type: 'hotspot',
          title: 'Quan sát hình ảnh bo mạch chủ (Motherboard) bên dưới và nhấp chuột chọn vị trí khe cắm bộ xử lý trung tâm (CPU Socket):',
          mediaType: 'none',
          hotspotImageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
          explanation: 'Vùng socket CPU nằm ở khu vực trung tâm phía trên của bo mạch chủ, được bảo vệ bởi khung nắp gài kim loại.',
          hotspotRegions: [
            {
              id: 'cpu_socket_zone',
              x: 35,
              y: 20,
              width: 30,
              height: 40,
              label: 'Vùng Socket CPU',
            },
          ],
        },
        {
          id: 'q7',
          type: 'fill_blank',
          title: 'Chọn các đáp án chính xác từ danh sách thả xuống để điền vào các vị trí còn trống trong đoạn văn sau:',
          mediaType: 'none',
          explanation: 'Trong mô hình mạng OSI, tầng Giao vận (Transport) có TCP/UDP, tầng Mạng (Network) xử lý định tuyến gói tin IP.',
          fillBlankTemplate: 'Trong mô hình mạng 7 tầng OSI, tầng [b1] chịu trách nhiệm phân mảnh dữ liệu và truyền tin cậy với giao thức TCP, trong khi tầng [b2] sử dụng địa chỉ logic (IP) để tìm đường đi tối ưu cho gói tin.',
          fillBlankItems: [
            {
              id: 'fb_1',
              placeholderCode: '[b1]',
              options: ['Giao vận (Transport)', 'Liên kết dữ liệu (Data Link)', 'Trình diễn (Presentation)'],
              correctAnswer: 'Giao vận (Transport)',
            },
            {
              id: 'fb_2',
              placeholderCode: '[b2]',
              options: ['Mạng (Network)', 'Ứng dụng (Application)', 'Vật lý (Physical)'],
              correctAnswer: 'Mạng (Network)',
            },
          ],
        },
      ],
    };

    const exam2Id = 'exam_sample_it_002';
    const sampleExam2: Exam = {
      id: exam2Id,
      title: 'Đề Thi Thử Ngẫu Nhiên - Lập Trình Cơ Bản & Mạng Máy Tính',
      description: 'Đề thi thử với cơ chế bốc ngẫu nhiên câu hỏi mỗi lần làm bài. Thang điểm 1000đ, chuẩn đạt 950đ.',
      subject: 'Lập trình Cơ bản',
      grade: 'Khối 12',
      creatorId: 'usr_teacher_01',
      creatorName: 'ThS. Nguyễn Văn Hùng',
      classIds: [class1Id, class2Id],
      durationMinutes: 30,
      totalScore: 1000,
      passingScore: 950,
      status: 'published',
      allowReviewAnswers: true,
      isPracticeTest: true,
      practiceRandomCount: 4,
      createdAt: now,
      updatedAt: now,
      questions: sampleExam1.questions,
    };

    // Update local cache
    localSchools = [initialSchool];
    localClasses = [class1, class2];
    localStudents = [student1, student2];
    localExams = [sampleExam1, sampleExam2];

    notifySchools();
    notifyClasses();
    notifyStudents();
    notifyExams();

    if (isConfigured) {
      try {
        await Promise.allSettled([
          supabase.from(SCHOOLS_TABLE).upsert(cleanDbData(initialSchool)),
          supabase.from(CLASSES_TABLE).upsert(cleanDbData([class1, class2])),
          supabase.from(STUDENTS_TABLE).upsert(cleanDbData([student1, student2])),
          supabase.from(EXAMS_TABLE).upsert(cleanDbData([sampleExam1, sampleExam2])),
        ]);
      } catch (err) {
        handleSupabaseError(err, OperationType.WRITE, 'seed_data');
      }
    }
  }
}

// ================= CRUD: SCHOOLS =================
export async function addSchool(data: Omit<School, 'id' | 'createdAt' | 'updatedAt'>, _actorUsername?: string): Promise<School | undefined> {
  const id = `sch_${Date.now()}`;
  const now = new Date().toISOString();
  const school: School = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  localSchools = [school, ...localSchools];
  notifySchools();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(SCHOOLS_TABLE).insert(cleanDbData(school));
      if (error) handleSupabaseError(error, OperationType.CREATE, `${SCHOOLS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, `${SCHOOLS_TABLE}/${id}`);
    }
  }
  return school;
}

export async function updateSchool(id: string, data: Partial<School>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localSchools = localSchools.map((s) => (s.id === id ? { ...s, ...data, updatedAt: now } : s));
  notifySchools();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(SCHOOLS_TABLE).update(cleanDbData({ ...data, updatedAt: now })).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${SCHOOLS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${SCHOOLS_TABLE}/${id}`);
    }
  }
}

export async function deleteSchool(id: string, _schoolName?: string, _actorUsername?: string): Promise<void> {
  localSchools = localSchools.filter((s) => s.id !== id);
  notifySchools();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(SCHOOLS_TABLE).delete().eq('id', id);
      if (error) handleSupabaseError(error, OperationType.DELETE, `${SCHOOLS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, `${SCHOOLS_TABLE}/${id}`);
    }
  }
}

// ================= CRUD: CLASSES =================
export async function addClass(data: Omit<SchoolClass, 'id' | 'createdAt' | 'updatedAt'>, _actorUsername?: string): Promise<SchoolClass | undefined> {
  const id = `cls_${Date.now()}`;
  const now = new Date().toISOString();
  const cls: SchoolClass = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  localClasses = [cls, ...localClasses];
  notifyClasses();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(CLASSES_TABLE).insert(cleanDbData(cls));
      if (error) handleSupabaseError(error, OperationType.CREATE, `${CLASSES_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, `${CLASSES_TABLE}/${id}`);
    }
  }
  return cls;
}

export async function updateClass(id: string, data: Partial<SchoolClass>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localClasses = localClasses.map((c) => (c.id === id ? { ...c, ...data, updatedAt: now } : c));
  notifyClasses();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(CLASSES_TABLE).update(cleanDbData({ ...data, updatedAt: now })).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${CLASSES_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${CLASSES_TABLE}/${id}`);
    }
  }
}

export async function deleteClass(id: string, _className?: string, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localClasses = localClasses.filter((c) => c.id !== id);
  notifyClasses();

  // 1. Unlink students belonging to this class
  localStudents = localStudents.map((st) => (st.classId === id ? { ...st, classId: '', updatedAt: now } : st));
  notifyStudents();

  // 2. Remove this class from teacher classIds
  localUsers = localUsers.map((u) => {
    if (Array.isArray(u.classIds) && u.classIds.includes(id)) {
      return { ...u, classIds: u.classIds.filter((cid) => cid !== id), updatedAt: now };
    }
    return u;
  });
  notifyUsers();

  if (isConfigured) {
    try {
      await supabase.from(CLASSES_TABLE).delete().eq('id', id);
      await supabase.from(STUDENTS_TABLE).update({ classId: '', updatedAt: now }).eq('classId', id);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, `${CLASSES_TABLE}/${id}`);
    }
  }
}

// ================= CRUD: STUDENTS =================
export async function addStudent(data: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>, _actorUsername?: string): Promise<Student | undefined> {
  const id = `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const student: Student = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  localStudents = [student, ...localStudents];
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).insert(cleanDbData(student));
      if (error) handleSupabaseError(error, OperationType.CREATE, `${STUDENTS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, `${STUDENTS_TABLE}/${id}`);
    }
  }
  return student;
}

export async function updateStudent(id: string, data: Partial<Student>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  localStudents = localStudents.map((st) => (st.id === id ? { ...st, ...data, updatedAt: now } : st));
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).update(cleanDbData({ ...data, updatedAt: now })).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${STUDENTS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${STUDENTS_TABLE}/${id}`);
    }
  }
}

export async function deleteStudent(id: string, _studentName?: string, _actorUsername?: string): Promise<void> {
  localStudents = localStudents.filter((st) => st.id !== id);
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).delete().eq('id', id);
      if (error) handleSupabaseError(error, OperationType.DELETE, `${STUDENTS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, `${STUDENTS_TABLE}/${id}`);
    }
  }
}

export async function deleteMultipleStudents(ids: string[], _actorUsername?: string): Promise<void> {
  const idSet = new Set(ids);
  localStudents = localStudents.filter((st) => !idSet.has(st.id));
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).delete().in('id', ids);
      if (error) handleSupabaseError(error, OperationType.DELETE, STUDENTS_TABLE);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, STUDENTS_TABLE);
    }
  }
}

// ================= SPECIALIZED ADMIN FUNCTIONS =================
export async function toggleStudentStatus(id: string, currentStatus: Student['status'], _actorUsername?: string): Promise<Student['status']> {
  const newStatus: Student['status'] = currentStatus === 'active' ? 'suspended' : 'active';
  const now = new Date().toISOString();

  localStudents = localStudents.map((st) => (st.id === id ? { ...st, status: newStatus, updatedAt: now } : st));
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).update({ status: newStatus, updatedAt: now }).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${STUDENTS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${STUDENTS_TABLE}/${id}`);
    }
  }
  return newStatus;
}

export async function updateStudentUsername(id: string, newUsername: string, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();
  const trimmed = newUsername.trim();

  localStudents = localStudents.map((st) => (st.id === id ? { ...st, username: trimmed, updatedAt: now } : st));
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).update({ username: trimmed, updatedAt: now }).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${STUDENTS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${STUDENTS_TABLE}/${id}`);
    }
  }
}

export async function moveStudentsToClass(
  studentIds: string[],
  targetClassId: string,
  targetSchoolId: string,
  _actorUsername?: string
): Promise<void> {
  const now = new Date().toISOString();
  const idSet = new Set(studentIds);

  localStudents = localStudents.map((st) =>
    idSet.has(st.id) ? { ...st, classId: targetClassId, schoolId: targetSchoolId, updatedAt: now } : st
  );
  notifyStudents();

  if (isConfigured) {
    try {
      const { error } = await supabase
        .from(STUDENTS_TABLE)
        .update({ classId: targetClassId, schoolId: targetSchoolId, updatedAt: now })
        .in('id', studentIds);
      if (error) handleSupabaseError(error, OperationType.UPDATE, STUDENTS_TABLE);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, STUDENTS_TABLE);
    }
  }
}

export async function assignTeacherSchoolAndClasses(
  teacherId: string,
  schoolId: string,
  classIds: string[],
  _actorUsername?: string
): Promise<void> {
  const now = new Date().toISOString();

  localUsers = localUsers.map((u) => (u.id === teacherId ? { ...u, schoolId, classIds, updatedAt: now } : u));
  notifyUsers();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(USERS_TABLE).update({ schoolId, classIds, updatedAt: now }).eq('id', teacherId);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${USERS_TABLE}/${teacherId}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${USERS_TABLE}/${teacherId}`);
    }
  }
}

// ================= CRUD: USERS (TEACHERS / ADMIN) =================
export async function addUserAccount(
  data: Omit<UserAccount, 'id' | 'createdAt' | 'updatedAt'>,
  _actorUsername?: string
): Promise<UserAccount | undefined> {
  const id = `usr_${Date.now()}`;
  const now = new Date().toISOString();
  const user: UserAccount = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  localUsers = [user, ...localUsers];
  notifyUsers();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(USERS_TABLE).insert(cleanDbData(user));
      if (error) handleSupabaseError(error, OperationType.CREATE, `${USERS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, `${USERS_TABLE}/${id}`);
    }
  }
  return user;
}

export async function updateUserAccount(id: string, data: Partial<UserAccount>, _actorUsername?: string): Promise<void> {
  const now = new Date().toISOString();

  localUsers = localUsers.map((u) => (u.id === id ? { ...u, ...data, updatedAt: now } : u));
  notifyUsers();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(USERS_TABLE).update(cleanDbData({ ...data, updatedAt: now })).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${USERS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${USERS_TABLE}/${id}`);
    }
  }
}

export async function deleteUserAccount(id: string, _username?: string, _actorUsername?: string): Promise<void> {
  localUsers = localUsers.filter((u) => u.id !== id);
  notifyUsers();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(USERS_TABLE).delete().eq('id', id);
      if (error) handleSupabaseError(error, OperationType.DELETE, `${USERS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, `${USERS_TABLE}/${id}`);
    }
  }
}

// ================= BATCH ADD STUDENTS =================
export async function batchAddStudents(
  studentsData: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<number> {
  const now = new Date().toISOString();
  const newStudents: Student[] = studentsData.map((st) => ({
    ...st,
    id: `std_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  }));

  localStudents = [...newStudents, ...localStudents];
  notifyStudents();

  if (isConfigured && newStudents.length > 0) {
    try {
      const { error } = await supabase.from(STUDENTS_TABLE).insert(cleanDbData(newStudents));
      if (error) handleSupabaseError(error, OperationType.CREATE, STUDENTS_TABLE);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, STUDENTS_TABLE);
    }
  }
  return newStudents.length;
}

// ================= CRUD: EXAMS =================
export async function addExam(data: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exam> {
  const id = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const exam: Exam = {
    ...data,
    id,
    totalScore: 1000,
    passingScore: 950,
    createdAt: now,
    updatedAt: now,
  };

  localExams = [exam, ...localExams];
  notifyExams();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(EXAMS_TABLE).insert(cleanDbData(exam));
      if (error) handleSupabaseError(error, OperationType.CREATE, `${EXAMS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, `${EXAMS_TABLE}/${id}`);
    }
  }
  return exam;
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<void> {
  const now = new Date().toISOString();
  const payload = cleanDbData({
    ...data,
    totalScore: 1000,
    passingScore: 950,
    updatedAt: now,
  });

  localExams = localExams.map((e) => (e.id === id ? { ...e, ...payload } : e));
  notifyExams();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(EXAMS_TABLE).update(payload).eq('id', id);
      if (error) handleSupabaseError(error, OperationType.UPDATE, `${EXAMS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.UPDATE, `${EXAMS_TABLE}/${id}`);
    }
  }
}

export async function deleteExam(id: string): Promise<void> {
  localExams = localExams.filter((e) => e.id !== id);
  notifyExams();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(EXAMS_TABLE).delete().eq('id', id);
      if (error) handleSupabaseError(error, OperationType.DELETE, `${EXAMS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, `${EXAMS_TABLE}/${id}`);
    }
  }
}

export async function mergeExams(
  sourceExams: Exam[],
  newTitle: string,
  newDuration: number,
  creatorId: string,
  creatorName: string,
  targetClassIds: string[],
  isPracticeTest: boolean = false,
  practiceRandomCount: number = 0
): Promise<Exam> {
  const combinedQuestions = sourceExams.flatMap((exam) =>
    exam.questions.map((q) => ({
      ...q,
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }))
  );

  return await addExam({
    title: newTitle,
    description: `Đề thi tổng hợp gộp từ ${sourceExams.length} đề thi: ${sourceExams.map((e) => e.title).join(', ')}`,
    subject: sourceExams[0]?.subject || 'Công nghệ Thông tin',
    grade: sourceExams[0]?.grade || 'Khối 12',
    creatorId,
    creatorName,
    classIds: targetClassIds,
    durationMinutes: newDuration,
    totalScore: 1000,
    passingScore: 950,
    status: 'published',
    allowReviewAnswers: true,
    isPracticeTest,
    practiceRandomCount: isPracticeTest && practiceRandomCount > 0 ? practiceRandomCount : 0,
    questions: combinedQuestions,
  });
}

// ================= CRUD: EXAM SUBMISSIONS =================
export async function addExamSubmission(data: Omit<ExamSubmission, 'id'>): Promise<ExamSubmission> {
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const submission: ExamSubmission = {
    ...data,
    id,
  };

  localSubmissions = [submission, ...localSubmissions];
  notifySubmissions();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(SUBMISSIONS_TABLE).insert(cleanDbData(submission));
      if (error) handleSupabaseError(error, OperationType.CREATE, `${SUBMISSIONS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.CREATE, `${SUBMISSIONS_TABLE}/${id}`);
    }
  }
  return submission;
}

export async function deleteExamSubmission(id: string): Promise<void> {
  localSubmissions = localSubmissions.filter((s) => s.id !== id);
  notifySubmissions();

  if (isConfigured) {
    try {
      const { error } = await supabase.from(SUBMISSIONS_TABLE).delete().eq('id', id);
      if (error) handleSupabaseError(error, OperationType.DELETE, `${SUBMISSIONS_TABLE}/${id}`);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, `${SUBMISSIONS_TABLE}/${id}`);
    }
  }
}

export async function deleteMultipleExamSubmissions(ids: string[]): Promise<number> {
  const idSet = new Set(ids);
  const initialCount = localSubmissions.length;
  localSubmissions = localSubmissions.filter((s) => !idSet.has(s.id));
  notifySubmissions();

  if (isConfigured) {
    try {
      await supabase.from(SUBMISSIONS_TABLE).delete().in('id', ids);
    } catch (error) {
      handleSupabaseError(error, OperationType.DELETE, SUBMISSIONS_TABLE);
    }
  }
  return initialCount - localSubmissions.length;
}

export async function deleteStudentSubmissions(
  studentId: string,
  submissionsList: ExamSubmission[]
): Promise<number> {
  const targetIds = submissionsList.filter((s) => s.studentId === studentId).map((s) => s.id);
  if (targetIds.length === 0) return 0;
  return await deleteMultipleExamSubmissions(targetIds);
}
