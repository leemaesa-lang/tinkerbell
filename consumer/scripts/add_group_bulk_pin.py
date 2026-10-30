from pathlib import Path

p = Path('/home/ubuntu/tinkerbell-dc-prototype/client/src/pages/Home.tsx')
s = p.read_text()

# Shared meeting verification model.
needle = 'type Meeting = { id: number; ageRequirement?: AgeRequirement;'
idx = s.find(needle)
if idx < 0:
    raise SystemExit('Meeting type not found')
line_end = s.find('\n', idx)
if 'type MeetingBulkVisitAuth' not in s:
    s = s[:line_end + 1] + '''type MeetingBulkVisitAuth = { meetingId: number; store: string; verifiedAt: string; memberCount: number; verifiedBy: string };
const meetingBulkVisitKey = (meetingId: number) => `dangam_meeting_bulk_visit_${meetingId}`;

''' + s[line_end + 1:]

s = s.replace(
    'type IssuedCouponRecord = { userCouponId?: string; coupon: Coupon; visitDate: string; dateKey: string; pickupTime: string; partySize: string; status: CouponStatus; usedAt?: string };',
    'type IssuedCouponRecord = { userCouponId?: string; coupon: Coupon; visitDate: string; dateKey: string; pickupTime: string; partySize: string; status: CouponStatus; usedAt?: string; bulkVisitVerified?: boolean };'
)

old_sig = 'function MeetingDetailSheet({ meeting, participation, onToggle, onChat, onClose, genderAllowed, ageAllowed, onAccessBlocked }: { meeting: Meeting; participation: Participation; onToggle: () => void; onChat: () => void; onClose: () => void; genderAllowed: boolean; ageAllowed: boolean; onAccessBlocked: () => void })'
new_sig = 'function MeetingDetailSheet({ meeting, participation, onToggle, onChat, onClose, genderAllowed, ageAllowed, onAccessBlocked, isHost, bulkVisitAuth, onOpenBulkPin }: { meeting: Meeting; participation: Participation; onToggle: () => void; onChat: () => void; onClose: () => void; genderAllowed: boolean; ageAllowed: boolean; onAccessBlocked: () => void; isHost: boolean; bulkVisitAuth?: MeetingBulkVisitAuth; onOpenBulkPin: () => void })'
if old_sig not in s:
    raise SystemExit('MeetingDetailSheet signature not found')
s = s.replace(old_sig, new_sig, 1)
s = s.replace(
    'const isFull = participation.currentMembers >= participation.maxMembers; const canJoin = (!isFull || participation.isJoined) && genderAllowed && ageAllowed;',
    'const isFull = participation.currentMembers >= participation.maxMembers; const canJoin = (!isFull || participation.isJoined) && genderAllowed && ageAllowed; const bulkVisitVerified = Boolean(bulkVisitAuth);',
    1,
)
old_panel = '<div className="meeting-host-safe-panel"><p className="eyebrow">MEETING HOST</p><h3>👑 모임장: 의왕버디왕</h3><span>단골 5회 인증 · 매너 좋은 모임장</span><p>개인정보 보호를 위해 연락처는 공개되지 않으며, 모임 대화방을 이용해 주세요.</p></div><button className={`wide-orange meeting-detail-join'
new_panel = '''<div className="meeting-host-safe-panel"><p className="eyebrow">MEETING HOST</p><h3>👑 모임장: 의왕버디왕</h3><span>단골 5회 인증 · 매너 좋은 모임장</span><p>개인정보 보호를 위해 연락처는 공개되지 않으며, 모임 대화방을 이용해 주세요.</p></div>{isHost && <div className={`meeting-bulk-visit-panel ${bulkVisitVerified ? "verified" : ""}`}><div><strong>{bulkVisitVerified ? "✅ 모임 매장 방문 인증 완료" : "🏷️ 제휴 매장 방문 확인"}</strong><span>{bulkVisitVerified ? `${bulkVisitAuth?.memberCount ?? participation.currentMembers}명 참석자 앱에 사용 완료가 동기화되었습니다.` : `모임장 대표 PIN 인증으로 확정 멤버 ${participation.currentMembers}명 쿠폰을 한 번에 처리합니다.`}</span></div>{bulkVisitVerified ? <small>{bulkVisitAuth?.verifiedAt} · 매장 확인 완료</small> : <button type="button" disabled={!isFull} onClick={onOpenBulkPin}>{isFull ? `제휴 매장 방문 확인 (${participation.currentMembers}명 일괄 인증)` : "모임 확정 후 일괄 인증 가능"}</button>}</div>}<button className={`wide-orange meeting-detail-join'''
if old_panel not in s:
    raise SystemExit('host panel insertion point not found')
s = s.replace(old_panel, new_panel, 1)

marker = 'function MeetingAdultGate({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void })'
if marker not in s:
    raise SystemExit('adult gate marker not found')
if 'function MeetingBulkMerchantPinSheet' not in s:
    component = '''function MeetingBulkMerchantPinSheet({ meeting, memberCount, onClose, onComplete }: { meeting: Meeting; memberCount: number; onClose: () => void; onComplete: (auth: MeetingBulkVisitAuth) => void }) { const [pin, setPin] = useState(""); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false); const [completed, setCompleted] = useState(false); const [verifiedAt, setVerifiedAt] = useState(""); const addDigit = (digit: string) => { if (submitting || completed || pin.length >= 4) return; setError(""); setPin((value) => `${value}${digit}`); }; const verify = () => { if (pin.length !== 4 || submitting) return; if (pin !== "1234") { setError("PIN 번호가 일치하지 않습니다. 다시 확인해 주세요."); setPin(""); return; } setSubmitting(true); const time = new Date().toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replaceAll("/", "."); const auth: MeetingBulkVisitAuth = { meetingId: meeting.id, store: meeting.place, verifiedAt: time, memberCount, verifiedBy: "모임장" }; window.localStorage.setItem(meetingBulkVisitKey(meeting.id), JSON.stringify(auth)); window.dispatchEvent(new CustomEvent("dangam:meeting-bulk-visit", { detail: auth })); setVerifiedAt(time); setCompleted(true); setSubmitting(false); onComplete(auth); }; return <div className="overlay meeting-bulk-pin-overlay" onClick={onClose}><section className="meeting-bulk-pin-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose} aria-label="모임 매장 PIN 인증 닫기"><X size={17} /></button>{completed ? <div className="meeting-bulk-success"><div className="merchant-success-icon"><Check size={34} /></div><p className="eyebrow">GROUP VISIT VERIFIED</p><h2>모임 매장 방문 인증 완료</h2><p>{memberCount}명의 확정 참석자 쿠폰이 사용 완료로 처리되었습니다.</p><div className="meeting-bulk-receipt"><span>방문 매장</span><b>{meeting.place}</b><span>인증 시각</span><b>{verifiedAt}</b><span>동기화 상태</span><b>참석자 앱에 실시간 반영됨</b></div><button className="wide-orange" onClick={onClose}>확인</button></div> : <><p className="eyebrow">GROUP CHECK-IN · HOST ONLY</p><h2>🔒 모임장 대표 일괄 인증</h2><p className="meeting-bulk-copy">사장님 전용 PIN 4자리를 입력하면 참석 확정 멤버 전원의 매장 방문이 한 번에 인증됩니다.</p><div className="meeting-bulk-target"><strong>{meeting.place}</strong><span>확정 참석자 {memberCount}명 · {meeting.benefit}</span></div><div className="merchant-pin-dots" aria-label={`입력된 PIN ${pin.length}자리`}>{[0, 1, 2, 3].map((index) => <i key={index} className={index < pin.length ? "filled" : ""} />)}</div>{error && <p className="merchant-pin-error" role="alert">{error}</p>}<div className="merchant-keypad">{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <button key={digit} type="button" onClick={() => addDigit(digit)}>{digit}</button>)}<button type="button" className="keypad-clear" onClick={() => { setPin(""); setError(""); }}>⌫ 지우기</button><button type="button" onClick={() => addDigit("0")}>0</button><button type="button" className="keypad-confirm" disabled={pin.length !== 4 || submitting} onClick={verify}>{submitting ? "확인 중" : "일괄 인증 완료"}</button></div><small className="merchant-test-pin">테스트용 PIN: 1234</small></>}</section></div>; }
'''
    s = s.replace(marker, component + marker, 1)

state_needle = 'const [partnerNotice, setPartnerNotice] = useState("");'
state_insert = '''const [partnerNotice, setPartnerNotice] = useState(""); const [bulkVisitAuthByMeeting, setBulkVisitAuthByMeeting] = useState<Record<number, MeetingBulkVisitAuth>>({}); const [bulkPinMeeting, setBulkPinMeeting] = useState<Meeting | null>(null); useEffect(() => { const syncBulkVisits = () => { setBulkVisitAuthByMeeting((current) => { const next = { ...current }; meetings.forEach((meeting) => { const raw = window.localStorage.getItem(meetingBulkVisitKey(meeting.id)); if (raw) { try { next[meeting.id] = JSON.parse(raw) as MeetingBulkVisitAuth; } catch { /* ignore malformed demo state */ } } }); return next; }); }; syncBulkVisits(); window.addEventListener("storage", syncBulkVisits); const timer = window.setInterval(syncBulkVisits, 1000); return () => { window.removeEventListener("storage", syncBulkVisits); window.clearInterval(timer); }; }, []); const completeBulkVisit = (auth: MeetingBulkVisitAuth) => { setBulkVisitAuthByMeeting((current) => ({ ...current, [auth.meetingId]: auth })); setBulkPinMeeting(null); showFeedback(`${auth.memberCount}명 참석자의 매장 방문 인증이 완료되었습니다.`, setMeetingToast); };'''
if state_needle not in s:
    raise SystemExit('MeetingView state needle not found')
s = s.replace(state_needle, state_insert, 1)

old_call = 'onAccessBlocked={() => handleAccessBlocked(detail)} genderAllowed={genderAllowedFor(detail)} ageAllowed={ageAllowedFor(detail, currentUser.age)} onClose={() => setDetail(null)} />'
new_call = 'onAccessBlocked={() => handleAccessBlocked(detail)} genderAllowed={genderAllowedFor(detail)} ageAllowed={ageAllowedFor(detail, currentUser.age)} isHost={detail.organizerName === "홍길동" || userMeetings.some((item) => item.id === detail.id)} bulkVisitAuth={bulkVisitAuthByMeeting[detail.id]} onOpenBulkPin={() => setBulkPinMeeting(detail)} onClose={() => setDetail(null)} />'
if old_call not in s:
    raise SystemExit('MeetingDetailSheet call not found')
s = s.replace(old_call, new_call, 1)

render_needle = ')}{chatMeeting && <MeetingChatSheet'
render_repl = ')}{bulkPinMeeting && <MeetingBulkMerchantPinSheet meeting={bulkPinMeeting} memberCount={getParticipation(bulkPinMeeting).currentMembers} onClose={() => setBulkPinMeeting(null)} onComplete={completeBulkVisit} />} {chatMeeting && <MeetingChatSheet'
if render_needle not in s:
    raise SystemExit('render insertion point not found')
s = s.replace(render_needle, render_repl, 1)

p.write_text(s)
