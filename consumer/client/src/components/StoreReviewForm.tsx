import { useState, type FormEvent, type Ref } from "react";
import { Star } from "lucide-react";

export type StoreReviewSubmission = { rating: number; tags: string[]; text: string };

type StoreReviewFormProps = {
  formRef?: Ref<HTMLFormElement>;
  canReview?: boolean;
  onSubmit?: (review: StoreReviewSubmission) => Promise<void>;
};

const quickReviewTags = ["맛있어요", "친절해요", "가성비 좋아요"] as const;

export function StoreReviewForm({ formRef, canReview = false, onSubmit }: StoreReviewFormProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const toggleTag = (tag: string) => {
    setFeedback("");
    setError("");
    setSelectedTags((current) => current.includes(tag)
      ? current.filter((item) => item !== tag)
      : current.length < 3 ? [...current, tag] : current);
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canReview || !onSubmit || !rating || !text.trim() || submitting) return;
    setSubmitting(true);
    setFeedback("");
    setError("");
    try {
      await onSubmit({ rating, tags: selectedTags, text: text.trim() });
      setSelectedTags([]);
      setRating(0);
      setText("");
      setFeedback("리뷰가 등록되었습니다");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "리뷰를 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const isDisabled = !canReview || submitting;
  return (
    <form ref={formRef} className="store-review-form" onSubmit={submitReview} aria-label="리뷰 작성 및 피드">
      <strong className="store-review-form-title">리뷰 작성</strong>
      <p className="store-review-access-note">
        {canReview ? "쿠폰 사용이 확인되었습니다. 방문 후기를 작성해 주세요." : "매장에서 쿠폰 사용 완료 후 작성하실 수 있습니다"}
      </p>
      <fieldset className="store-review-rating" disabled={isDisabled}>
        <legend>별점 선택</legend>
        <div className="store-review-stars">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={value <= rating ? "store-review-star selected" : "store-review-star"}
              aria-label={`${value}점`}
              aria-pressed={rating === value}
              onClick={() => { setRating(value); setFeedback(""); setError(""); }}
            >
              <Star size={21} fill={value <= rating ? "currentColor" : "none"} aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="store-review-chips" aria-label="간편 평가">
        {quickReviewTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={selectedTags.includes(tag) ? "store-review-chip selected" : "store-review-chip"}
            aria-pressed={selectedTags.includes(tag)}
            disabled={isDisabled}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <label className="store-review-text-label" htmlFor="store-review-text">솔직한 방문 후기</label>
      <textarea
        id="store-review-text"
        value={text}
        onChange={(event) => { setText(event.target.value); setFeedback(""); setError(""); }}
        placeholder="방문 후기를 남겨 주세요"
        rows={3}
        maxLength={300}
        disabled={isDisabled}
        required={canReview}
      />
      <span className="store-review-character-count">{text.length}/300</span>
      {error && <p className="store-review-error" role="alert">{error}</p>}
      {feedback && <p className="store-review-success" role="status">{feedback}</p>}
      <button className="store-review-submit" type="submit" disabled={!canReview || !onSubmit || submitting || !rating || !text.trim()}>
        {submitting ? "등록 중" : "리뷰 등록"}
      </button>
    </form>
  );
}
