import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Bell, Building2, CalendarDays, ClipboardCheck, CreditCard, Headset, LayoutDashboard, Monitor, PanelsTopLeft, RadioTower, RotateCcw, ShieldAlert, Store, TicketPercent, UserRound, Users, UsersRound } from "lucide-react";
import { Gift } from "lucide-react";

const navItems = [
  { href: "/", label: "전체 시스템 관제 홈", icon: LayoutDashboard },
  { href: "/ops-overview", label: "오늘 할 일", icon: ClipboardCheck },
  { href: "/coupons", label: "쿠폰 관리", icon: TicketPercent },
  { href: "/charges", label: "충전 관리", icon: CreditCard },
  { href: "/refunds", label: "환불 관리", icon: RotateCcw },
  { href: "/stores", label: "사업장 관리", icon: Store },
  { href: "/users", label: "회원 관리", icon: UsersRound },
  { href: "/popup-ads", label: "팝업 광고 관리", icon: PanelsTopLeft },
  { href: "/community-ops", label: "중고 장터 및 모임 관리", icon: ShieldAlert },
  { href: "/support", label: "고객지원(문의·신고)", icon: Headset },
  { href: "/benefits", label: "혜택 지급 관리", icon: Gift },
  { href: "/partners", label: "영업 파트너 관리", icon: Users },
  { href: "/reservations", label: "예약 관리", icon: CalendarDays },
  { href: "/business-operations", label: "사업자 운영", icon: Building2 },
  { href: "/consumer-activity", label: "소비자 운영", icon: UserRound },
  { href: "/notifications", label: "알림 관리", icon: Bell },
  { href: "/events", label: "이벤트 큐", icon: Activity },
  { href: "/integrations", label: "연동 테스트", icon: RadioTower },
  { href: "/app-previews", label: "통합 미리보기", icon: Monitor },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 ring-1 ring-orange-100">
        <img src="/tinkerbell-mark.svg" alt="" className="h-7 w-7 object-contain" />
      </div>
      <div className="min-w-0">
        <div className="text-[16px] font-extrabold tracking-tight text-slate-900">팅커벨 운영</div>
        <div className="mt-1 text-[15px] font-bold text-slate-700">운영 관리 콘솔</div>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link href={href} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-3.5 text-[15px] font-bold transition-colors ${active ? "bg-orange-50 text-[#E85D04]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`}>
      <Icon size={18} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-[#FF6F0F]" : "text-slate-400 group-hover:text-slate-600"} />
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FF6F0F]" />}
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const basePath = `/${location.split("/").filter(Boolean)[0] ?? ""}`;
  const path = basePath === "/admin" || basePath === "/overview" ? "/" : basePath;
  const title = navItems.find(item => item.href === path)?.label ?? "전체 시스템 관제 홈";
  const timeLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());

  return (
    <div className="dashboard-shell min-h-screen bg-[#F7F8FA] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white lg:flex">
        <Brand />
        <nav aria-label="운영 메뉴" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          <div className="mb-2 px-3 pt-2 text-[15px] font-bold text-slate-700">운영 메뉴</div>
          {navItems.map(item => <NavLink key={item.href} {...item} active={path === item.href} />)}
        </nav>
      </aside>

      <div className="min-h-screen min-w-0 lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-3 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50"><img src="/tinkerbell-mark.svg" alt="" className="h-6 w-6 object-contain" /></div><span className="text-[15px] font-extrabold">팅커벨 운영</span></div>
          <div className="hidden text-[15px] font-semibold text-slate-700 lg:block">운영 콘솔 <span className="mx-2 text-slate-500">/</span><span className="font-bold text-slate-900">{title}</span></div>
          <div className="ml-auto flex items-center gap-2.5 sm:gap-4">
            <span className="hidden text-[15px] font-bold text-slate-700 sm:inline">{timeLabel}</span>
          </div>
        </header>
        <main className="w-full min-w-0 px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:px-9 lg:pb-12">{children}</main>
      </div>

      <nav aria-label="관리 메뉴" className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          const mobileLabel = href === "/" ? "관제 홈" : href === "/app-previews" ? "미리보기" : href === "/partners" ? "파트너" : href === "/notifications" ? "알림" : href === "/support" ? "고객지원" : href === "/business-operations" ? "사업자" : href === "/stores" ? "사업장" : href === "/charges" ? "충전" : href === "/refunds" ? "환불" : label;
          return <Link key={href} href={href} className={`flex w-[96px] min-h-16 shrink-0 flex-col items-center justify-center gap-1.5 py-2.5 text-[15px] font-bold ${active ? "text-[#E85D04]" : "text-slate-700"}`}><Icon size={20} strokeWidth={active ? 2.4 : 1.8} /><span className="truncate">{mobileLabel}</span></Link>;
        })}
      </nav>
    </div>
  );
}
