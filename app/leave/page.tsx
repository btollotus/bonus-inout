'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

// =====================================================================
// 타입 정의
// =====================================================================
type LeaveRequest = {
  id: string
  user_id: string
  employee_name: string
  leave_type: 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'SICK' | 'FRIDAY_OFF' | 'SPECIAL' | 'REMOTE'
  leave_date: string
  note: string | null
  created_at: string
}

type AllLeaveRequest = LeaveRequest & {
  is_mine: boolean
}

type LeaveBalance = {
  total_days: number
  used_days: number
  remaining_days: number
}

type EmpLeaveBalance = {
  employee_id: string
  employee_name: string
  total_days: number
  used_days: number
  remaining_days: number
  manual_override?: boolean
  override_reason?: string
  hire_date?: string
}

// 보건증: employee_health_certs 테이블 (id, employee_id, exam_date, note, created_at)
type HealthCert = {
  id: string
  employee_id: string
  employee_name: string
  exam_date: string
  renew_date: string // exam_date + 1년
}

// =====================================================================
// 상수
// =====================================================================
const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: '연차 (1일)',
  HALF_AM: '반차 - 오전 (0.5일)',
  HALF_PM: '반차 - 오후 (0.5일)',
  SICK: '병가 (1일)',
  FRIDAY_OFF: '금요일 휴무 (1일)',
  SPECIAL: '경조사 휴가 (유급)',
  REMOTE: '재택근무',
}
const LEAVE_TYPE_SHORT: Record<string, string> = {
  ANNUAL: '연차', HALF_AM: '오전반차', HALF_PM: '오후반차',
  SICK: '병가', FRIDAY_OFF: '금휴', SPECIAL: '경조사', REMOTE: '재택',
}
const LEAVE_TYPE_DAYS: Record<string, number> = {
  ANNUAL: 1, HALF_AM: 0.5, HALF_PM: 0.5, SICK: 1, FRIDAY_OFF: 1, SPECIAL: 0, REMOTE: 0,
}
const MY_BG: Record<string, string> = {
  ANNUAL: 'bg-blue-500', HALF_AM: 'bg-indigo-500', HALF_PM: 'bg-violet-500',
  SICK: 'bg-rose-500', FRIDAY_OFF: 'bg-orange-500', SPECIAL: 'bg-yellow-500',
  REMOTE: 'bg-teal-500',
}
const OTHER_STYLE: Record<string, string> = {
  ANNUAL: 'bg-blue-100 text-blue-800', HALF_AM: 'bg-indigo-100 text-indigo-800',
  HALF_PM: 'bg-violet-100 text-violet-800', SICK: 'bg-rose-100 text-rose-800',
  FRIDAY_OFF: 'bg-orange-100 text-orange-800', SPECIAL: 'bg-yellow-100 text-yellow-800',
  REMOTE: 'bg-teal-100 text-teal-800',
}

// =====================================================================
// 공휴일 (2024~2028) - 2026년 설날 정정
// =====================================================================
const ALL_HOLIDAYS: Record<string, string> = {
  // 2024
  '2024-01-01':'신정','2024-02-09':'설날 연휴','2024-02-10':'설날',
  '2024-01-02':'창립기념일',
  '2024-02-11':'설날 연휴','2024-02-12':'설날 대체공휴일',
  '2024-03-01':'삼일절','2024-04-10':'국회의원 선거일',
  '2024-05-05':'어린이날','2024-05-06':'어린이날 대체공휴일',
  '2024-05-15':'부처님오신날','2024-06-06':'현충일',
  '2024-08-15':'광복절','2024-09-16':'추석 연휴','2024-09-17':'추석',
  '2024-09-18':'추석 연휴','2024-10-03':'개천절','2024-10-09':'한글날',
  '2024-12-25':'크리스마스',
  // 2025
  '2025-01-01':'신정','2025-01-28':'설날 연휴','2025-01-29':'설날',
  '2025-01-02':'창립기념일',
  '2025-01-30':'설날 연휴','2025-03-01':'삼일절','2025-03-03':'삼일절 대체공휴일',
  '2025-05-05':'어린이날','2025-05-06':'부처님오신날','2025-06-06':'현충일',
  '2025-08-15':'광복절','2025-10-03':'개천절','2025-10-05':'추석 연휴',
  '2025-10-06':'추석','2025-10-07':'추석 연휴','2025-10-08':'추석 대체공휴일',
  '2025-10-09':'한글날','2025-12-25':'크리스마스',
  // 2026 - 설날: 2/17(화) 당일만 공휴일 (네이버 달력 기준)
  // 2/15(일)~2/18(수) 연휴는 관공서 공휴일이나 법정공휴일 아님
  '2026-01-01':'신정',
  '2026-01-02':'창립기념일',
  '2026-02-17':'설날',
  '2026-03-01':'삼일절','2026-03-02':'삼일절 대체공휴일',
  '2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-09-24':'추석 연휴','2026-09-25':'추석',
  '2026-09-26':'추석 연휴','2026-10-03':'개천절','2026-10-09':'한글날',
  '2026-12-25':'크리스마스',
  // 2027
  '2027-01-01':'신정','2027-02-06':'설날 연휴','2027-02-07':'설날',
  '2027-01-02':'창립기념일',
  '2027-02-08':'설날 연휴','2027-03-01':'삼일절','2027-05-05':'어린이날',
  '2027-05-13':'부처님오신날','2027-06-06':'현충일','2027-08-15':'광복절',
  '2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴',
  '2027-10-03':'개천절','2027-10-04':'개천절 대체공휴일',
  '2027-10-09':'한글날','2027-12-25':'크리스마스',
  // 2028
  '2028-01-01':'신정','2028-01-26':'설날 연휴','2028-01-27':'설날',
  '2028-01-02':'창립기념일',
  '2028-01-28':'설날 연휴','2028-03-01':'삼일절','2028-05-02':'부처님오신날',
  '2028-05-05':'어린이날','2028-06-06':'현충일','2028-08-15':'광복절',
  '2028-10-03':'개천절','2028-10-09':'한글날','2028-12-25':'크리스마스',
}

// =====================================================================
// 24절기 (2024~2028)
// =====================================================================
const SOLAR_TERMS: Record<string, string> = {
  '2024-01-06':'소한','2024-01-20':'대한','2024-02-04':'입춘','2024-02-19':'우수',
  '2024-03-05':'경칩','2024-03-20':'춘분','2024-04-04':'청명','2024-04-19':'곡우',
  '2024-05-05':'입하','2024-05-20':'소만','2024-06-05':'망종','2024-06-21':'하지',
  '2024-07-06':'소서','2024-07-22':'대서','2024-08-07':'입추','2024-08-22':'처서',
  '2024-09-07':'백로','2024-09-22':'추분','2024-10-08':'한로','2024-10-23':'상강',
  '2024-11-07':'입동','2024-11-22':'소설','2024-12-07':'대설','2024-12-21':'동지',
  '2025-01-05':'소한','2025-01-20':'대한','2025-02-03':'입춘','2025-02-18':'우수',
  '2025-03-05':'경칩','2025-03-20':'춘분','2025-04-04':'청명','2025-04-20':'곡우',
  '2025-05-05':'입하','2025-05-21':'소만','2025-06-05':'망종','2025-06-21':'하지',
  '2025-07-07':'소서','2025-07-22':'대서','2025-08-07':'입추','2025-08-23':'처서',
  '2025-09-07':'백로','2025-09-23':'추분','2025-10-08':'한로','2025-10-23':'상강',
  '2025-11-07':'입동','2025-11-22':'소설','2025-12-07':'대설','2025-12-22':'동지',
  '2026-01-05':'소한','2026-01-20':'대한','2026-02-04':'입춘','2026-02-19':'우수',
  '2026-03-05':'경칩','2026-03-20':'춘분','2026-04-05':'청명','2026-04-20':'곡우',
  '2026-05-05':'입하','2026-05-21':'소만','2026-06-06':'망종','2026-06-21':'하지',
  '2026-07-07':'소서','2026-07-23':'대서','2026-08-07':'입추','2026-08-23':'처서',
  '2026-09-08':'백로','2026-09-23':'추분','2026-10-08':'한로','2026-10-23':'상강',
  '2026-11-07':'입동','2026-11-22':'소설','2026-12-07':'대설','2026-12-22':'동지',
  '2027-01-06':'소한','2027-01-20':'대한','2027-02-04':'입춘','2027-02-18':'우수',
  '2027-03-06':'경칩','2027-03-21':'춘분','2027-04-05':'청명','2027-04-20':'곡우',
  '2027-05-06':'입하','2027-05-21':'소만','2027-06-06':'망종','2027-06-21':'하지',
  '2027-07-07':'소서','2027-07-23':'대서','2027-08-07':'입추','2027-08-23':'처서',
  '2027-09-08':'백로','2027-09-23':'추분','2027-10-08':'한로','2027-10-24':'상강',
  '2027-11-07':'입동','2027-11-22':'소설','2027-12-07':'대설','2027-12-22':'동지',
  '2028-01-06':'소한','2028-01-20':'대한','2028-02-04':'입춘','2028-02-19':'우수',
  '2028-03-05':'경칩','2028-03-20':'춘분','2028-04-04':'청명','2028-04-19':'곡우',
  '2028-05-05':'입하','2028-05-20':'소만','2028-06-05':'망종','2028-06-21':'하지',
  '2028-07-06':'소서','2028-07-22':'대서','2028-08-07':'입추','2028-08-22':'처서',
  '2028-09-07':'백로','2028-09-22':'추분','2028-10-07':'한로','2028-10-23':'상강',
  '2028-11-07':'입동','2028-11-22':'소설','2028-12-06':'대설','2028-12-21':'동지',
}

// =====================================================================
// 음력 변환
// 각 음력 연도의 양력 시작일 + 월별 일수 (대월30/소월29, 윤달 포함)
// leapMonth: 해당 달 다음에 윤달 삽입 (0=없음)
// months 배열: 1월~12월 순서 (윤달이 있으면 13개)
// =====================================================================
interface LunarYearInfo {
  start: string      // 음력 1월 1일의 양력 날짜
  leapMonth: number  // 윤달 위치 (0=없음, n=음력 n월 다음에 윤달)
  months: number[]   // 각 달의 일수 (윤달 포함하면 13개)
}

const LUNAR_DATA: LunarYearInfo[] = [
  // 2023 계묘년: 윤2월 포함 (384일) → 2024-02-10 ✓
  { start:'2023-01-22', leapMonth:2, months:[29,30,29,30,29,30,29,30,30,29,30,29,30] },
  // 2024 갑진년: 윤달 없음 (354일) → 2025-01-29 ✓
  { start:'2024-02-10', leapMonth:0, months:[29,30,29,29,30,29,30,29,30,30,29,30] },
  // 2025 을사년: 윤6월 포함 (384일) → 2026-02-17 ✓
  // 6월(29)→윤6월(30)→7월(29) 순서
  { start:'2025-01-29', leapMonth:6, months:[30,29,30,29,30,29,30,29,30,29,30,29,30] },
  // 2026 병오년: 윤달 없음 (355일) → 2027-02-07 ✓  [네이버 2월 달력 검증완료]
  // 1월=30(2/17~3/18), 2월=29(3/19~4/16), 12월=30
  { start:'2026-02-17', leapMonth:0, months:[30,29,30,29,30,29,30,29,30,29,30,30] },
  // 2027 정미년: 윤달 없음 (354일) → 2028-01-27 ✓
  { start:'2027-02-07', leapMonth:0, months:[29,29,30,29,30,29,30,30,30,29,30,29] },
  // 2028 무신년: 윤5월 포함 (383일) → 2029-02-13 ✓
  // 5월(30)→윤5월(29)→6월(29) 순서
  { start:'2028-01-27', leapMonth:5, months:[30,29,30,29,30,29,29,30,29,30,29,30,29] },
  // 2029 기유년: 윤달 없음 (355일) → 2030-02-03 ✓
  { start:'2029-02-13', leapMonth:0, months:[30,30,29,30,29,30,29,30,29,30,29,30] },
]

function getLunarDate(dateStr: string): { month: number; day: number; isLeap: boolean; lunarYear: number } | null {
  const date = new Date(dateStr + 'T00:00:00')

  for (let i = 0; i < LUNAR_DATA.length - 1; i++) {
    const cur = LUNAR_DATA[i]
    const next = LUNAR_DATA[i + 1]
    const startDate = new Date(cur.start + 'T00:00:00')
    const endDate = new Date(next.start + 'T00:00:00')
    if (date < startDate || date >= endDate) continue

    const diffMs = date.getTime() - startDate.getTime()
    let remaining = Math.floor(diffMs / 86400000)

    const leapMonth = cur.leapMonth
    const lunarYear = new Date(cur.start).getFullYear()

    // 윤달 있는 경우: months 배열에서 leapMonth 번째 달(0-based: leapMonth) 다음이 윤달
    // 예) leapMonth=6: 인덱스 0~5 = 1~6월, 인덱스 6 = 윤6월, 인덱스 7~12 = 7~12월
    for (let m = 0; m < cur.months.length; m++) {
      if (remaining < cur.months[m]) {
        let month: number
        let isLeap = false

        if (leapMonth === 0) {
          // 윤달 없음: 그냥 순서대로
          month = m + 1
        } else {
          // leapMonth가 있을 때:
          // 인덱스 0 ~ leapMonth-1 → 음력 1 ~ leapMonth 월
          // 인덱스 leapMonth       → 윤 leapMonth 월 (isLeap=true)
          // 인덱스 leapMonth+1 ~ 끝 → 음력 leapMonth+1 ~ 12월
          if (m < leapMonth) {
            month = m + 1
          } else if (m === leapMonth) {
            month = leapMonth
            isLeap = true
          } else {
            month = m  // leapMonth+1 이후는 m (leapMonth 자리가 윤달로 소비됐으므로)
          }
        }

        return { month, day: remaining + 1, isLeap, lunarYear }
      }
      remaining -= cur.months[m]
    }
  }
  return null
}

// =====================================================================
// 에러 메시지
// =====================================================================
function getKoreanErrorMessage(message: string): string {
  if (message.includes('uq_leave_requests_user_date_type') || message.includes('duplicate key'))
    return '해당 날짜에 이미 동일한 유형의 휴가 신청이 존재합니다.'
  if (message.includes('not found') || message.includes('No rows'))
    return '데이터를 찾을 수 없습니다.'
  if (message.includes('permission') || message.includes('policy'))
    return '접근 권한이 없습니다. 관리자에게 문의하세요.'
  if (message.includes('network') || message.includes('fetch'))
    return '네트워크 오류가 발생했습니다. 다시 시도해주세요.'
  return '오류가 발생했습니다. 다시 시도해주세요.'
}

type ModalMode = 'create' | 'edit'

// =====================================================================
// 메인 컴포넌트
// =====================================================================
export default function LeavePage() {
  const [role, setRole] = useState<string>('')
  const isAdmin = role === 'ADMIN'
  const supabase = createClient()
  const year = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([])
  const [allRequests, setAllRequests] = useState<AllLeaveRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [empId, setEmpId] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myName, setMyName] = useState<string>('')
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([])
  const [allBalances, setAllBalances] = useState<EmpLeaveBalance[]>([])
  const [showAllBalances, setShowAllBalances] = useState(false)
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear())
  const [editingBalance, setEditingBalance] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ total_days: number; override_reason: string }>({ total_days: 0, override_reason: '' })

  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminEmpId, setAdminEmpId] = useState('')
  const [adminDate, setAdminDate] = useState('')
  const [adminLeaveType, setAdminLeaveType] = useState('ANNUAL')
  const [adminNote, setAdminNote] = useState('')

  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  // employee_health_certs: exam_date 기준 1년 후 갱신
  const [healthCerts, setHealthCerts] = useState<HealthCert[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [modalDate, setModalDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [leaveType, setLeaveType] = useState('ANNUAL')
  const [note, setNote] = useState('')

  useEffect(() => { fetchData() }, [])
  useEffect(() => { fetchHealthCerts() }, [])
  useEffect(() => { if (isAdmin) fetchAllBalances() }, [leaveYear, isAdmin])

  // =====================================================================
  // 근로기준법 연차 계산
  // =====================================================================
  function calcLegalLeaveDays(hireDateStr: string | null | undefined, targetYear: number): number {
    if (!hireDateStr) return 0
    const hire = new Date(hireDateStr)
    const yearStart = new Date(targetYear, 0, 1)
    const yearEnd = new Date(targetYear, 11, 31)
    if (hire > yearEnd) return 0
    const diffMs = yearStart.getTime() - hire.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    const yearsWorked = Math.floor(Math.floor(diffDays / 30.44) / 12)
    if (yearsWorked < 1) {
      const hireYear = hire.getFullYear()
      const hireMonth = hire.getMonth()
      const months = hireYear < targetYear ? 11 : Math.min(11 - hireMonth, 11)
      return Math.max(0, months)
    }
    if (yearsWorked < 3) return 15
    return Math.min(15 + Math.floor((yearsWorked - 1) / 2), 25)
  }

  // =====================================================================
  // 보건증 갱신일 조회
  // 테이블: employee_health_certs (employee_id, exam_date)
  // =====================================================================
  async function fetchHealthCerts() {
    try {
      const { data, error } = await supabase
        .from('employee_health_certs')
        .select('id, employee_id, exam_date, employees(name)')
        .order('exam_date', { ascending: false })

      if (error || !data) return

      // 직원별 최신 exam_date만 유지
      const latestMap: Record<string, any> = {}
      for (const row of data) {
        if (!latestMap[row.employee_id]) latestMap[row.employee_id] = row
      }

      const certs: HealthCert[] = Object.values(latestMap).map((row: any) => {
        const exam = new Date(row.exam_date + 'T00:00:00')
        const renew = new Date(exam)
        renew.setFullYear(renew.getFullYear() + 1)
        return {
          id: row.id,
          employee_id: row.employee_id,
          employee_name: (row.employees as any)?.name ?? '알 수 없음',
          exam_date: row.exam_date,
          renew_date: renew.toISOString().split('T')[0],
        }
      })
      setHealthCerts(certs)
    } catch { /* employee_health_certs 접근 불가 시 무시 */ }
  }

  function getCertsForDate(dateStr: string): HealthCert[] {
    return healthCerts.filter(c => c.renew_date === dateStr)
  }

  // =====================================================================
  // 전체 직원 연차 현황 (ADMIN)
  // leave_balance: total_granted, used_days, remaining_days 모두 DB에 저장
  // 실제 remaining = total_granted - (leave_requests 집계) 로 재계산
  // =====================================================================
  async function fetchAllBalances() {
    const thisYear = leaveYear
    const { data: empList } = await supabase
      .from('employees').select('id, name, hire_date, auth_user_id')
      .is('resign_date', null).order('name')

    const { data: balList } = await supabase
      .from('leave_balance')
      .select('employee_id, total_granted, used_days, remaining_days, manual_override, override_reason')
      .eq('year', thisYear)
    const balMap: Record<string, any> = {}
    for (const b of (balList || [])) balMap[b.employee_id] = b

    // leave_requests → user_id 기준이므로 auth_user_id로 매핑
    const { data: reqList } = await supabase
      .from('leave_requests').select('user_id, leave_type')
      .gte('leave_date', `${thisYear}-01-01`).lte('leave_date', `${thisYear}-12-31`)

    const authToEmpMap: Record<string, string> = {}
    for (const e of (empList || [])) { if (e.auth_user_id) authToEmpMap[e.auth_user_id] = e.id }

    const usedMap: Record<string, number> = {}
    for (const r of (reqList || [])) {
      const eid = authToEmpMap[r.user_id] ?? r.user_id
      const t = r.leave_type?.toUpperCase()
      const days = (t==='ANNUAL'||t==='FRIDAY_OFF') ? 1 : (t==='HALF_AM'||t==='HALF_PM') ? 0.5 : 0
      usedMap[eid] = (usedMap[eid] || 0) + days
    }

    // 법정 연차 자동 생성/갱신
    for (const e of (empList || [])) {
      if (!e.hire_date) continue
      const legalDays = calcLegalLeaveDays(e.hire_date, thisYear)
      const bal = balMap[e.id]
      const usedNow = usedMap[e.id] ?? 0
      if (!bal) {
        const { data: ins } = await supabase.from('leave_balance').insert({
          employee_id: e.id, user_id: e.auth_user_id, year: thisYear,
          total_granted: legalDays, used_days: usedNow,
          remaining_days: Math.max(0, legalDays - usedNow), manual_override: false,
        }).select().maybeSingle()
        if (ins) balMap[e.id] = ins
      } else if (!bal.manual_override && bal.total_granted !== legalDays) {
        await supabase.from('leave_balance').update({
          total_granted: legalDays, used_days: usedNow,
          remaining_days: Math.max(0, legalDays - usedNow),
        }).eq('employee_id', e.id).eq('year', thisYear)
        balMap[e.id] = { ...bal, total_granted: legalDays, used_days: usedNow, remaining_days: Math.max(0, legalDays - usedNow) }
      }
    }

    const result: EmpLeaveBalance[] = (empList || []).map((e: any) => {
      const bal = balMap[e.id]
      const total = bal?.total_granted ?? calcLegalLeaveDays(e.hire_date, thisYear)
      const used = usedMap[e.id] ?? (bal?.used_days ?? 0)
      return {
        employee_id: e.id, employee_name: e.name, hire_date: e.hire_date,
        total_days: total, used_days: used, remaining_days: Math.max(0, total - used),
        manual_override: bal?.manual_override ?? false, override_reason: bal?.override_reason ?? '',
      }
    })
    setAllBalances(result)
  }

  async function saveManualOverride(targetEmpId: string) {
    const emp = allBalances.find(b => b.employee_id === targetEmpId)
    if (!emp) return
    const total = editDraft.total_days
    const used = emp.used_days
    const { data: existing } = await supabase.from('leave_balance')
      .select('id').eq('employee_id', targetEmpId).eq('year', leaveYear).maybeSingle()
    const payload = {
      total_granted: total, used_days: used,
      remaining_days: Math.max(0, total - used),
      manual_override: true, override_reason: editDraft.override_reason || null,
    }
    if (existing) {
      const { error: e } = await supabase.from('leave_balance').update(payload).eq('id', existing.id)
      if (e) { alert('저장 오류: ' + e.message); return }
    } else {
      const { error: e } = await supabase.from('leave_balance').insert({ employee_id: targetEmpId, year: leaveYear, ...payload })
      if (e) { alert('저장 오류: ' + e.message); return }
    }
    setEditingBalance(null)
    await fetchAllBalances()
  }

  // =====================================================================
  // 데이터 로드
  // leave_requests: user_id + employee_name 기반 (employee_id 컬럼 없음)
  // =====================================================================
  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyUserId(user.id)

    const { data: roleData } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    const currentRole = roleData?.role ?? ''
    setRole(currentRole)
    const currentIsAdmin = currentRole === 'ADMIN'

    const { data: empListAll } = await supabase
      .from('employees').select('id, name').eq('is_active', true).order('name')
    setEmployees(empListAll || [])

    const { data: emp } = await supabase
      .from('employees').select('id, name, hire_date').eq('auth_user_id', user.id).single()

    if (!emp) {
      if (!currentIsAdmin) { setError('직원 정보가 없습니다. 관리자에게 직원등록을 요청하세요.'); return }
    } else {
      setEmpId(emp.id)
      setMyName(emp.name ?? '')
      const year_str = String(year)

      let { data: bal } = await supabase
        .from('leave_balance')
        .select('total_granted, used_days, remaining_days')
        .eq('employee_id', emp.id).eq('year', year).maybeSingle()

      if (!bal && emp.hire_date) {
        const legalDays = calcLegalLeaveDays(emp.hire_date, year)
        const { data: inserted } = await supabase.from('leave_balance').insert({
          employee_id: emp.id, user_id: user.id, year,
          total_granted: legalDays, used_days: 0,
          remaining_days: legalDays, manual_override: false,
        }).select('total_granted, used_days, remaining_days').maybeSingle()
        bal = inserted
      }

      // leave_requests: user_id로 조회
      const { data: reqs } = await supabase
        .from('leave_requests').select('*')
        .eq('user_id', user.id).order('leave_date', { ascending: false })
      setMyRequests(reqs || [])

      // 실제 사용일수 집계
      const used = (reqs || [])
        .filter((r: any) => r.leave_date?.startsWith(year_str))
        .reduce((s: number, r: any) => {
          const t = r.leave_type?.toUpperCase()
          return s + ((t==='ANNUAL'||t==='FRIDAY_OFF') ? 1 : (t==='HALF_AM'||t==='HALF_PM') ? 0.5 : 0)
        }, 0)
      const totalDays = bal?.total_granted ?? 0
      setBalance({ total_days: totalDays, used_days: used, remaining_days: Math.max(0, totalDays - used) })
    }

    // 전체 일정 (캘린더용) - employee_name은 leave_requests에 직접 저장됨
    const { data: allReqs } = await supabase
      .from('leave_requests').select('*').order('leave_date', { ascending: false })
    if (allReqs) {
      setAllRequests(allReqs.map((r: any) => ({ ...r, is_mine: r.user_id === user.id })))
    }

    if (currentIsAdmin) await fetchAllBalances()
  }

  const isFuture = (d: string) => isAdmin || d >= today

  function openCreateModal(dateStr: string) {
    if (!isFuture(dateStr)) return
    if (isAdmin) {
      setAdminDate(dateStr); setAdminEmpId(employees[0]?.id || '')
      setAdminLeaveType('ANNUAL'); setAdminNote(''); setAdminModalOpen(true)
      return
    }
    const existing = myRequests.find((r) => r.leave_date === dateStr)
    if (existing) { openEditModal(existing); return }
    setModalMode('create'); setModalDate(dateStr)
    setLeaveType('ANNUAL'); setNote(''); setEditingId(null); setModalOpen(true)
  }

  function openEditModal(req: LeaveRequest) {
    setModalMode('edit'); setModalDate(req.leave_date)
    setLeaveType(req.leave_type); setNote(req.note || '')
    setEditingId(req.id); setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditingId(null) }

  async function handleSubmit() {
    if (!modalDate || !myUserId) return
    setLoading(true); setError(''); setSuccess('')
    if (modalMode === 'create') {
      const days = LEAVE_TYPE_DAYS[leaveType]
      if (balance && days > 0 && days > balance.remaining_days) {
        setError('잔여 연차가 부족합니다.'); setLoading(false); return
      }
      const { error: e } = await supabase.from('leave_requests').insert([{
        user_id: myUserId, employee_name: myName,
        leave_type: leaveType, leave_date: modalDate, note: note || null,
      }])
      if (e) { setError(getKoreanErrorMessage(e.message)); setLoading(false); return }
      setSuccess(`${modalDate} 휴가 신청이 완료되었습니다.`)
    } else {
      const { error: e } = await supabase.from('leave_requests')
        .update({ leave_type: leaveType, note: note || null }).eq('id', editingId)
      if (e) { setError(getKoreanErrorMessage(e.message)); setLoading(false); return }
      setSuccess(`${modalDate} 휴가 신청이 수정되었습니다.`)
    }
    closeModal(); setLoading(false); fetchData()
  }

  async function handleAdminSubmit() {
    if (!adminDate || !adminEmpId) return
    setLoading(true); setError(''); setSuccess('')
    const { data: empData } = await supabase
      .from('employees').select('auth_user_id, name').eq('id', adminEmpId).single()
    const { error: e } = await supabase.from('leave_requests').insert([{
      user_id: empData?.auth_user_id ?? adminEmpId,
      employee_name: empData?.name ?? '',
      leave_type: adminLeaveType, leave_date: adminDate, note: adminNote || null,
    }])
    if (e) { setError(getKoreanErrorMessage(e.message)); setLoading(false); return }
    setSuccess(`${adminDate} 휴가 입력이 완료되었습니다.`)
    setAdminModalOpen(false); setLoading(false); fetchData()
  }

  async function handleAdminDelete(id: string) {
    if (!confirm('이 휴가 기록을 삭제하시겠습니까?')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('신청을 삭제하시겠습니까?')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    fetchData()
  }

  // =====================================================================
  // 달력 렌더링
  // =====================================================================
  function renderCalendar() {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const monthLeaves = allRequests.filter((r) => r.leave_date.startsWith(monthStr))
    const cells: React.ReactNode[] = []

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`e${i}`} className="rounded-xl border border-gray-100 bg-gray-50/60 min-h-[110px]" />)
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`
      const dayLeaves = monthLeaves.filter((r) => r.leave_date === dateStr)
      const isToday = dateStr === today
      const dow = new Date(calYear, calMonth, d).getDay()
      const isSun = dow === 0; const isSat = dow === 6
      const isHoliday = !!ALL_HOLIDAYS[dateStr]
      const holidayName = ALL_HOLIDAYS[dateStr] || ''
      const isRed = isSun || isHoliday
      const clickable = isFuture(dateStr)
      const certsDue = getCertsForDate(dateStr)
      const solarTerm = SOLAR_TERMS[dateStr] || ''
      const lunar = getLunarDate(dateStr)

      // 음력 표시
      let lunarStr = ''
      let lunarIsMonthStart = false
      if (lunar) {
        lunarIsMonthStart = lunar.day === 1
        if (lunarIsMonthStart) {
          lunarStr = lunar.isLeap ? `윤${lunar.month}` : `음${lunar.month}월`
        } else {
          lunarStr = `${lunar.day}`
        }
      }

      cells.push(
        <div
          key={d}
          onClick={() => clickable && openCreateModal(dateStr)}
          className={[
            'rounded-xl border min-h-[110px] p-1.5 flex flex-col gap-0.5 transition-all duration-150',
            isToday ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-300'
              : isHoliday ? 'border-red-200 bg-red-50/40'
              : 'border-gray-200 bg-white',
            clickable ? 'cursor-pointer hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30'
              : 'opacity-45 cursor-default',
          ].join(' ')}
        >
          {/* 날짜 + 음력 + 우측 뱃지들 */}
          <div className="flex items-start justify-between gap-0.5">
            {/* 날짜 숫자 + 음력 */}
            <div className="flex flex-col items-center shrink-0 min-w-[28px]">
              <span className={[
                'text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full',
                isToday ? 'bg-blue-500 text-white'
                  : isRed ? 'text-red-500'
                  : isSat ? 'text-blue-500'
                  : 'text-gray-700',
              ].join(' ')}>{d}</span>
              {lunarStr && (
                <span className={`text-[9px] leading-tight text-center ${
                  lunarIsMonthStart ? 'text-amber-600 font-bold' : 'text-gray-400'
                }`}>
                  {lunarStr}
                </span>
              )}
            </div>

            {/* 공휴일명 + 절기 + 인원수 */}
            <div className="flex flex-col items-end gap-0.5 min-w-0 flex-1">
              {holidayName && (
                <span className="text-[9px] font-medium text-red-500 bg-red-100 rounded px-1 py-0.5 truncate max-w-[66px]" title={holidayName}>
                  {holidayName}
                </span>
              )}
              {solarTerm && (
                <span className="text-[9px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 py-0.5">
                  {solarTerm}
                </span>
              )}
              {dayLeaves.length > 0 && (
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                  {dayLeaves.length}명
                </span>
              )}
            </div>
          </div>

          {/* 일정 뱃지 */}
          <div className="flex flex-col gap-0.5 mt-0.5">
            {dayLeaves.map((lv) =>
              lv.is_mine ? (
                <div key={lv.id}
                  className={`flex items-center gap-1 px-1.5 py-[3px] rounded-md text-white text-[11px] font-semibold leading-tight ${MY_BG[lv.leave_type]}`}
                  title={`${lv.employee_name} · ${LEAVE_TYPE_LABEL[lv.leave_type]}${lv.note ? ` · ${lv.note}` : ''}`}
                >
                  <span className="shrink-0 text-[9px]">★</span>
                  <span className="truncate min-w-0">{lv.employee_name}</span>
                  <span className="shrink-0 text-white/60 text-[9px]">·</span>
                  <span className="shrink-0 text-white/90">{LEAVE_TYPE_SHORT[lv.leave_type]}</span>
                </div>
              ) : (
                <div key={lv.id}
                  className={`flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[11px] font-medium leading-tight ${OTHER_STYLE[lv.leave_type]}`}
                  title={`${lv.employee_name} · ${LEAVE_TYPE_LABEL[lv.leave_type]}${lv.note ? ` · ${lv.note}` : ''}`}
                >
                  <span className="truncate min-w-0">{lv.employee_name}</span>
                  <span className="shrink-0 opacity-40 text-[9px]">·</span>
                  <span className="shrink-0">{LEAVE_TYPE_SHORT[lv.leave_type]}</span>
                  {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); handleAdminDelete(lv.id) }}
                      className="shrink-0 text-red-400 hover:text-red-600 text-[9px] ml-0.5 font-bold">✕</button>
                  )}
                </div>
              )
            )}

            {/* 보건증 갱신 뱃지 */}
            {certsDue.map((cert) => (
              <div key={`cert-${cert.id}`}
                onClick={(e) => e.stopPropagation()}
                className="health-cert-badge flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[11px] font-semibold leading-tight bg-emerald-500 text-white"
                title={`${cert.employee_name} 보건증 갱신일 (검사일: ${cert.exam_date})`}
              >
                <span className="shrink-0">🏥</span>
                <span className="truncate min-w-0">{cert.employee_name}</span>
                <span className="shrink-0 text-white/70 text-[9px]">·</span>
                <span className="shrink-0">보건증</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return cells
  }

  // =====================================================================
  // 렌더
  // =====================================================================
  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        @keyframes healthPulse {
          0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(16,185,129,0.6); }
          50% { opacity:0.82; box-shadow:0 0 0 5px rgba(16,185,129,0); }
        }
        .health-cert-badge { animation: healthPulse 1.6s ease-in-out infinite; }
      `}</style>

      {/* 헤더 */}
      <div className="max-w-screen-xl mx-auto px-6 pt-8 pb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">연차 / 반차 / 병가 신청</h1>
            <p className="text-sm text-gray-400 mt-0.5">날짜를 클릭하여 신청하거나 수정할 수 있습니다</p>
          </div>
          <div className="flex gap-3 shrink-0">
            {[
              { label:'부여 연차', value:balance?.total_days??0, color:'text-blue-600', ring:'ring-blue-200 bg-blue-50' },
              { label:'사용 연차', value:balance?.used_days??0, color:'text-orange-500', ring:'ring-orange-200 bg-orange-50' },
              { label:'잔여 연차', value:balance?.remaining_days??0, color:'text-emerald-600', ring:'ring-emerald-200 bg-emerald-50' },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl ring-1 px-5 py-3 text-center ${item.ring}`}>
                <p className="text-[11px] text-gray-400 mb-0.5">{item.label}</p>
                <p className={`text-2xl font-bold ${item.color}`}>
                  {item.value}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span>
                </p>
              </div>
            ))}
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4 flex justify-between items-center">
            <span>{error}</span><button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm mb-4 flex justify-between items-center">
            <span>{success}</span><button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-600 ml-4">✕</button>
          </div>
        )}
      </div>

      {/* ADMIN 전체 직원 연차 현황 */}
      {isAdmin && (
        <div className="max-w-screen-xl mx-auto px-6 pb-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <button onClick={() => setShowAllBalances(!showAllBalances)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-800">👑 전체 직원 연차 현황</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{allBalances.length}명</span>
                <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">입사일 기준 자동</span>
              </div>
              <div className="flex items-center gap-3">
                <select value={leaveYear} onClick={e => e.stopPropagation()} onChange={e => setLeaveYear(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  {[year+1, year, year-1].map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                <span className="text-gray-400 text-sm">{showAllBalances ? '▲' : '▼'}</span>
              </div>
            </button>
            {showAllBalances && (
              <div className="border-t border-gray-100 px-5 py-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">직원</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-blue-600">부여 연차</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-orange-500">사용 연차</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-emerald-600">잔여 연차</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400">사용률</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {allBalances.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-xs">연차 데이터가 없습니다.</td></tr>
                      ) : (
                        [...allBalances].sort((a,b) => a.employee_name.localeCompare(b.employee_name,'ko')).map((b) => {
                          const pct = b.total_days > 0 ? Math.round(b.used_days / b.total_days * 100) : 0
                          const barColor = pct>=90 ? 'bg-red-400' : pct>=70 ? 'bg-orange-400' : 'bg-emerald-400'
                          const isEditing = editingBalance === b.employee_id
                          return (
                            <tr key={b.employee_id} className="hover:bg-gray-50 align-top">
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-gray-800">{b.employee_name}</div>
                                {b.hire_date && (
                                  <div className="text-[10px] text-gray-400 mt-0.5">
                                    입사 {b.hire_date?.slice(0,10)} · 법정 {calcLegalLeaveDays(b.hire_date, leaveYear)}일
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isEditing ? (
                                  <div className="flex flex-col gap-1.5 items-center">
                                    <input type="number" value={editDraft.total_days} min={0} max={365} autoFocus
                                      onChange={e => setEditDraft(d => ({...d, total_days: Number(e.target.value)}))}
                                      className="w-16 text-center border-2 border-blue-400 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none" />
                                    <input type="text" value={editDraft.override_reason} placeholder="사유 (선택)"
                                      onChange={e => setEditDraft(d => ({...d, override_reason: e.target.value}))}
                                      className="w-32 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                                    <div className="flex gap-1">
                                      <button onClick={() => saveManualOverride(b.employee_id)}
                                        className="text-[10px] bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 font-medium">저장</button>
                                      <button onClick={() => setEditingBalance(null)}
                                        className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-200">취소</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="font-bold text-blue-600">
                                      {b.total_days > 0
                                        ? <>{b.total_days}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></>
                                        : <span className="text-xs text-gray-300">미설정</span>}
                                    </span>
                                    {b.manual_override
                                      ? <span title={b.override_reason||'수동조정'} className="text-[9px] text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded cursor-help">🔒수동</span>
                                      : <span className="text-[9px] text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded">자동</span>}
                                    <button onClick={() => { setEditingBalance(b.employee_id); setEditDraft({ total_days: b.total_days, override_reason: b.override_reason||'' }) }}
                                      className="text-[11px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors">✏️</button>
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-orange-500">
                                {b.used_days > 0 ? <>{b.used_days}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></> : <span className="text-gray-300">-</span>}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-emerald-600">
                                {b.total_days > 0 ? <>{b.remaining_days}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></> : <span className="text-xs text-gray-300">-</span>}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[80px]">
                                    <div className={`${barColor} h-2 rounded-full transition-all`} style={{width:`${Math.min(pct,100)}%`}} />
                                  </div>
                                  <span className={`text-xs font-medium w-8 ${pct>=90?'text-red-500':pct>=70?'text-orange-500':'text-gray-500'}`}>{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                    {allBalances.length > 0 && (
                      <tfoot className="border-t-2 border-gray-200">
                        <tr className="bg-gray-50">
                          <td className="py-2.5 px-3 text-xs font-bold text-gray-600">합계</td>
                          <td className="py-2.5 px-3 text-center text-xs font-bold text-blue-600">{allBalances.reduce((s,b)=>s+b.total_days,0)}일</td>
                          <td className="py-2.5 px-3 text-center text-xs font-bold text-orange-500">{allBalances.reduce((s,b)=>s+b.used_days,0)}일</td>
                          <td className="py-2.5 px-3 text-center text-xs font-bold text-emerald-600">{allBalances.reduce((s,b)=>s+b.remaining_days,0)}일</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 달력 */}
      <div className="max-w-screen-xl mx-auto px-6 pb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => { if (calMonth===0){setCalMonth(11);setCalYear(calYear-1)}else setCalMonth(calMonth-1) }}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">◀</button>

            <div className="flex flex-col items-center gap-2">
              <h3 className="text-xl font-bold text-gray-800">{calYear}년 {calMonth+1}월</h3>
              <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[8px]">★</span>
                  <span className="text-gray-400">내 일정</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
                  <span className="text-gray-400">팀원 일정</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                  <span className="text-gray-400">보건증 갱신</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-teal-700 text-[9px] font-bold bg-teal-50 border border-teal-200 rounded px-1">절기</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-amber-600 text-[9px] font-bold">음1월</span>
                  <span className="text-gray-400">음력</span>
                </span>
                <span className="w-px h-3 bg-gray-200" />
                {[
                  {color:'bg-blue-500',label:'연차'},{color:'bg-indigo-500',label:'오전반차'},
                  {color:'bg-violet-500',label:'오후반차'},{color:'bg-rose-500',label:'병가'},
                  {color:'bg-orange-500',label:'금휴'},{color:'bg-yellow-500',label:'경조사'},
                  {color:'bg-teal-500',label:'재택'},
                ].map(({color,label}) => (
                  <span key={label} className="flex items-center gap-1">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${color}`} />{label}
                  </span>
                ))}
              </div>
            </div>

            <button onClick={() => { if (calMonth===11){setCalMonth(0);setCalYear(calYear+1)}else setCalMonth(calMonth+1) }}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">▶</button>
          </div>

          <p className="text-xs text-blue-500 text-center mb-4">
            {isAdmin ? '📌 날짜를 클릭하여 직원 휴가를 입력할 수 있습니다 (관리자)'
              : '📌 오늘 이후 날짜를 클릭하면 신청 / 수정할 수 있습니다'}
          </p>

          <div className="grid grid-cols-7 mb-2">
            {['일','월','화','수','목','금','토'].map((d,i) => (
              <div key={d} className={`text-center text-xs font-semibold py-2 tracking-wide
                ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">{renderCalendar()}</div>
        </div>

        {/* 내 신청 내역 */}
        <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">내 신청 내역</h4>
          {myRequests.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">신청 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {myRequests.map((req) => {
                const canEdit = isAdmin || isFuture(req.leave_date)
                return (
                  <div key={req.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border
                    ${canEdit ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${MY_BG[req.leave_type]}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{req.leave_date}</span>
                          {!isAdmin && !isFuture(req.leave_date) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-400">지난 날짜</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {LEAVE_TYPE_LABEL[req.leave_type]}
                          {req.note && <span className="text-gray-400"> · {req.note}</span>}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => openEditModal(req)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">수정</button>
                        <span className="text-gray-200 text-sm">|</span>
                        <button onClick={() => handleDelete(req.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">삭제</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ADMIN 휴가 입력 모달 */}
      {adminModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">👑 관리자 - 휴가 입력</h3>
              <button onClick={() => setAdminModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-sm font-semibold text-blue-700">📅 {adminDate}</p>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">직원 선택</label>
              <select value={adminEmpId} onChange={e => setAdminEmpId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형</label>
              <div className="space-y-1.5">
                {Object.entries(LEAVE_TYPE_LABEL).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    adminLeaveType===key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="adminLeaveType" value={key} checked={adminLeaveType===key}
                      onChange={() => setAdminLeaveType(key)} className="text-blue-600" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                사유 {adminLeaveType==='SPECIAL' ? <span className="text-red-500">* (경조사는 필수)</span> : '(선택)'}
              </label>
              {adminLeaveType==='SPECIAL' && (
                <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mb-2">⭐ 경조사 휴가는 연차 차감 없이 유급 처리됩니다.</p>
              )}
              {adminLeaveType==='REMOTE' && (
                <p className="text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mb-2">🏠 재택근무는 연차 차감 없이 처리됩니다.</p>
              )}
              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2}
                placeholder={adminLeaveType==='SPECIAL' ? '예: 본인결혼, 부모상, 자녀출산 등' : '관리자 입력'}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdminModalOpen(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">취소</button>
              <button onClick={handleAdminSubmit} disabled={loading||!adminEmpId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm">
                {loading ? '입력 중...' : '휴가 입력'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 신청 / 수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">{modalMode==='create' ? '휴가 신청' : '휴가 수정'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-sm font-semibold text-blue-700">📅 {modalDate}</p>
            </div>
            {(() => {
              const others = allRequests.filter(r => r.leave_date===modalDate && !r.is_mine)
              if (!others.length) return null
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ 같은 날 팀원 휴가</p>
                  {others.map(r => <p key={r.id} className="text-xs text-amber-600">{r.employee_name}: {LEAVE_TYPE_SHORT[r.leave_type]}</p>)}
                </div>
              )
            })()}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형</label>
              <div className="space-y-1.5">
                {Object.entries(LEAVE_TYPE_LABEL).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    leaveType===key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="leaveType" value={key} checked={leaveType===key}
                      onChange={() => setLeaveType(key)} className="text-blue-600" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
              {leaveType==='SPECIAL' && (
                <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mt-2">⭐ 경조사 휴가는 연차 차감 없이 유급 처리됩니다.</p>
              )}
              {leaveType==='REMOTE' && (
                <p className="text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mt-2">🏠 재택근무는 연차 차감 없이 처리됩니다.</p>
              )}
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">사유 (선택)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="개인사정"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={closeModal}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">취소</button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm">
                {loading ? (modalMode==='create' ? '신청 중...' : '수정 중...')
                  : modalMode==='create' ? `${LEAVE_TYPE_DAYS[leaveType]}일 신청` : '수정 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
