import type { MouseEventHandler, ReactNode, Ref, UIEventHandler } from "react";
import { ChevronLeft, EllipsisVertical } from "lucide-react";
import "./ChatRoomLayout.css";

type ChatRoomLayoutProps = {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  onBack: () => void;
  onMore: () => void;
  moreExpanded?: boolean;
  moreLabel?: string;
  headerMenu?: ReactNode;
  banner?: ReactNode;
  messagesRef?: Ref<HTMLElement>;
  onMessagesScroll?: UIEventHandler<HTMLElement>;
  messagesLabel?: string;
  messagesClassName?: string;
  composer: ReactNode;
  actionDrawer?: ReactNode;
  overlays?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onMessagesClick?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
};

export function ChatRoomLayout({
  title,
  subtitle,
  ariaLabel,
  onBack,
  onMore,
  moreExpanded = false,
  moreLabel = "채팅방 메뉴",
  headerMenu,
  banner,
  messagesRef,
  onMessagesScroll,
  messagesLabel = "대화 내용",
  messagesClassName = "",
  composer,
  actionDrawer,
  overlays,
  className = "",
  onClick,
  onMessagesClick,
  children,
}: ChatRoomLayoutProps) {
  const rootClassName = ["chat-room-layout", className].filter(Boolean).join(" ");
  const messagesClass = ["chat-room-layout-messages", messagesClassName].filter(Boolean).join(" ");

  return (
    <section className={rootClassName} role="region" aria-label={ariaLabel} onClick={onClick}>
      <header className="chat-room-layout-header">
        <button type="button" className="chat-room-layout-back" aria-label="뒤로가기" onClick={onBack}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="chat-room-layout-title">
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="chat-room-layout-header-actions">
          <button type="button" className="chat-room-layout-more" aria-label={moreLabel} aria-expanded={moreExpanded} onClick={onMore}>
            <EllipsisVertical size={20} aria-hidden="true" />
          </button>
          {headerMenu}
        </div>
      </header>
      {banner && <div className="chat-room-layout-banner">{banner}</div>}
      <main ref={messagesRef} onScroll={onMessagesScroll} onClick={onMessagesClick} className={messagesClass} aria-label={messagesLabel}>
        {children}
      </main>
      <footer className="chat-room-layout-composer">{composer}</footer>
      {actionDrawer && <div className="chat-room-layout-action-drawer" role="region" aria-label="채팅 추가 기능">{actionDrawer}</div>}
      {overlays}
    </section>
  );
}
