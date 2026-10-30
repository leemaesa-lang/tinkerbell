import * as React from "react";
import { useState } from "react";
import {
  DEFAULT_STORE_FACILITY_TAGS,
  MAX_CUSTOM_STORE_FACILITY_TAGS,
  MAX_STORE_FACILITY_TAG_LENGTH,
  normalizeStoreFacilityTag,
} from "../../../../shared/store-facilities";
import "./store-facilities.css";

type StoreFacilityAccordionProps = {
  customTags: string[];
  selectedTags: string[];
  disabled?: boolean;
  onToggle: (tag: string) => void;
  onAddCustomTag: (tag: string) => Promise<void>;
  onRemoveCustomTag: (tag: string) => Promise<void>;
};

export function StoreFacilityAccordion({
  customTags,
  selectedTags,
  disabled = false,
  onToggle,
  onAddCustomTag,
  onRemoveCustomTag,
}: StoreFacilityAccordionProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = new Set(selectedTags);
  const isBusy = disabled || saving;

  const addCustomTag = async () => {
    const tag = normalizeStoreFacilityTag(draft);
    if (!tag) {
      setError("편의시설 이름을 입력해 주세요.");
      return;
    }
    if ([...DEFAULT_STORE_FACILITY_TAGS, ...customTags].some(item => item.toLocaleLowerCase("ko-KR") === tag.toLocaleLowerCase("ko-KR"))) {
      setError("이미 등록된 편의시설입니다.");
      return;
    }
    if (customTags.length >= MAX_CUSTOM_STORE_FACILITY_TAGS) {
      setError(`커스텀 편의시설은 최대 ${MAX_CUSTOM_STORE_FACILITY_TAGS}개까지 등록할 수 있습니다.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onAddCustomTag(tag);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "편의시설을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addCustomTag();
  };

  const removeCustomTag = async (tag: string) => {
    setSaving(true);
    setError("");
    try {
      await onRemoveCustomTag(tag);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "편의시설을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="store-facility-accordion">
      <summary>
        <span>
          <strong>매장 편의시설</strong>
          <small>쿠폰 상세에 표시할 편의시설을 선택하세요.</small>
        </span>
        <span className="store-facility-count">선택 {selectedTags.length}개</span>
      </summary>
      <div className="store-facility-content">
        <div className="store-facility-chip-list" role="group" aria-label="기본 편의시설 선택">
          {DEFAULT_STORE_FACILITY_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              className={`store-facility-chip${selected.has(tag) ? " is-selected" : ""}`}
              aria-pressed={selected.has(tag)}
              disabled={isBusy}
              onClick={() => onToggle(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        {customTags.length > 0 && (
          <div className="store-facility-chip-list" role="group" aria-label="커스텀 편의시설 선택">
            {customTags.map(tag => (
              <span className="store-facility-custom-chip" key={tag}>
                <button
                  type="button"
                  className={`store-facility-chip${selected.has(tag) ? " is-selected" : ""}`}
                  aria-pressed={selected.has(tag)}
                  disabled={isBusy}
                  onClick={() => onToggle(tag)}
                >
                  {tag}
                </button>
                <button
                  type="button"
                  className="store-facility-remove"
                  aria-label={`${tag} 편의시설 태그 삭제`}
                  disabled={isBusy}
                  onClick={() => void removeCustomTag(tag)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="store-facility-add-form">
          <label className="sr-only" htmlFor="store-facility-custom-input">커스텀 편의시설 이름</label>
          <input
            id="store-facility-custom-input"
            type="text"
            value={draft}
            maxLength={MAX_STORE_FACILITY_TAG_LENGTH}
            placeholder="편의시설 직접 입력"
            disabled={isBusy}
            onChange={event => setDraft(event.currentTarget.value)}
            onKeyDown={handleDraftKeyDown}
          />
          <button type="button" disabled={isBusy || !draft.trim()} onClick={() => void addCustomTag()}>{saving ? "저장 중" : "추가"}</button>
        </div>
        {error && <p className="store-facility-error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
