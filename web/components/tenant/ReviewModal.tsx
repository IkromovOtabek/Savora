'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitReviewAction } from '@/app/actions/reviews';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

interface Props {
  open: boolean;
  onClose: () => void;
  saleId?: string;
  branchName?: string;
}

export default function ReviewModal({ open, onClose, saleId, branchName }: Props) {
  const [state, formAction, isPending] = useActionState(submitReviewAction, null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const d = useDict();
  const RATING_LABELS = ['', d.sales.review.ratings.r1, d.sales.review.ratings.r2, d.sales.review.ratings.r3, d.sales.review.ratings.r4, d.sales.review.ratings.r5];

  // Muvaffaqiyatdan keyin avtomatik yopish
  useEffect(() => {
    if (state?.success) {
      const t = setTimeout(() => onClose(), 1400);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  if (!open) return null;

  const active = hover || rating;

  return (
    <div className="rv-overlay" onClick={onClose}>
      <div className="rv-modal" role="dialog" aria-modal="true" aria-label={d.sales.review.aria} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rv-close" onClick={onClose} aria-label={d.common.close}><Icon name="close" size={16} /></button>

        {state?.success ? (
          <div className="rv-done">
            <div className="rv-done-ic"><Icon name="check" size={32} /></div>
            <h3>{state.success}</h3>
            <p>{d.sales.review.thanksSub}</p>
          </div>
        ) : (
          <>
            <h3 className="rv-title">{d.sales.review.title}</h3>
            <p className="rv-sub">{d.sales.review.sub}</p>

            <form action={formAction} className="rv-form">
              <input type="hidden" name="rating" value={rating} />
              {saleId && <input type="hidden" name="saleId" value={saleId} />}
              {branchName && <input type="hidden" name="branchName" value={branchName} />}

              <div className="rv-stars" role="radiogroup" aria-label={d.sales.review.ratingAria}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`rv-star${n <= active ? ' rv-star--on' : ''}`}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={tr(d.sales.review.nStars, { n })}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="rv-rating-label">{RATING_LABELS[active] || d.sales.review.pickStar}</div>

              <div className="rv-field">
                <label htmlFor="rv-author">{d.sales.review.yourName} <span className="rv-opt">{d.sales.newSale.optionalParen}</span></label>
                <input id="rv-author" name="authorName" type="text" maxLength={120} placeholder={d.sales.review.namePh} />
              </div>

              <div className="rv-field">
                <label htmlFor="rv-comment">{d.common.comment} <span className="rv-opt">{d.sales.newSale.optionalParen}</span></label>
                <textarea id="rv-comment" name="comment" maxLength={600} rows={3} placeholder={d.sales.review.commentPh} />
              </div>

              {state?.error && <div className="rv-error">{state.error}</div>}

              <div className="rv-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>{d.sales.review.later}</button>
                <button type="submit" className="btn btn-primary" disabled={isPending || rating === 0}>
                  {isPending ? d.common.sending : d.sales.review.send}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
