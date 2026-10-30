import type { ReactNode } from "react";
import { X } from "lucide-react";
import "./region-selection-sheet.css";

export type RegionSelectionSheetShellProps = {
  title: string;
  description?: string;
  ariaLabel?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export function RegionSelectionSheetShell({
  title,
  description,
  ariaLabel = title,
  closeLabel = "지역 선택 닫기",
  onClose,
  children,
  footer,
}: RegionSelectionSheetShellProps) {
  return (
    <div className="overlay location-overlay" onClick={onClose}>
      <section
        className="location-sheet nationwide-location-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby="location-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header className="location-sheet-header">
          <div>
            <h2 id="location-sheet-title">{title}</h2>
          </div>
          <button className="close-btn" type="button" aria-label={closeLabel} onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="location-sheet-scroll-body">
          {description ? <p className="location-selection-description">{description}</p> : null}
          {children}
        </div>
        <div className="location-sheet-footer">{footer}</div>
      </section>
    </div>
  );
}
