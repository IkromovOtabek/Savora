'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitReviewAction } from '@/app/actions/reviews';

interface Props {
  open: boolean;
  onClose: () => void;
  saleId?: string;
  branchName?: string;
}

const RATING_LABELS = ['', 'Yomon', 'O\'rtacha', 'Yaxshi', 'Juda yaxshi', 'A\'lo'];

export default function ReviewModal({ open, onClose, saleId, branchName }: Props) {
  const [state, formAction, isPending] = useActionState(submitReviewAction, null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

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
      <div className="rv-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rv-close" onClick={onClose} aria-label="Yopish">✕</button>

        {state?.success ? (
          <div className="rv-done">
            <div className="rv-done-ic">✓</div>
            <h3>{state.success}</h3>
            <p>Fikringiz bizga muhim.</p>
          </div>
        ) : (
          <>
            <h3 className="rv-title">Xizmatimizni baholang</h3>
            <p className="rv-sub">Sotuv yakunlandi — tajribangizni baholang va izoh qoldiring.</p>

            <form action={formAction} className="rv-form">
              <input type="hidden" name="rating" value={rating} />
              {saleId && <input type="hidden" name="saleId" value={saleId} />}
              {branchName && <input type="hidden" name="branchName" value={branchName} />}

              <div className="rv-stars" role="radiogroup" aria-label="Baho">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`rv-star${n <= active ? ' rv-star--on' : ''}`}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n} yulduz`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="rv-rating-label">{RATING_LABELS[active] || 'Yulduzni tanlang'}</div>

              <div className="rv-field">
                <label htmlFor="rv-author">Ismingiz <span className="rv-opt">(ixtiyoriy)</span></label>
                <input id="rv-author" name="authorName" type="text" maxLength={120} placeholder="Masalan: Akmal" />
              </div>

              <div className="rv-field">
                <label htmlFor="rv-comment">Izoh <span className="rv-opt">(ixtiyoriy)</span></label>
                <textarea id="rv-comment" name="comment" maxLength={600} rows={3} placeholder="Xizmat haqida fikringiz…" />
              </div>

              {state?.error && <div className="rv-error">{state.error}</div>}

              <div className="rv-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>Keyinroq</button>
                <button type="submit" className="btn btn-primary" disabled={isPending || rating === 0}>
                  {isPending ? 'Yuborilmoqda…' : 'Yuborish'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
