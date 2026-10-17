'use client';

import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { LOCALHOST_LINKS } from '@/lib/urls';
import { useDict } from '@/lib/i18n/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SignupPromptModal({ open, onClose }: Props) {
  const d = useDict();
  const t = d.landing.signupPrompt;
  if (!open) return null;

  return (
    <div className="u-modal-overlay signup-prompt-overlay" onClick={onClose}>
      <div className="u-modal signup-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="u-modal-head">
          <h3>{t.title}</h3>
          <button type="button" className="u-icon-btn" onClick={onClose} aria-label={d.common.close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="signup-prompt-body">
          <p>
            {t.lead}
            <strong> {t.trial}</strong> {t.trialTail}
          </p>
          <ul className="signup-prompt-list">
            {t.points.map((p) => (
              <li key={p}><Icon name="check" size={14} /> {p}</li>
            ))}
          </ul>
          <div className="signup-prompt-actions">
            <Link href={LOCALHOST_LINKS.register} className="btn btn-primary btn-with-icon">
              <Icon name="signup" size={16} />
              {t.start}
            </Link>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t.later}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
