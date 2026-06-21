'use client';

import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { LOCALHOST_LINKS } from '@/lib/urls';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SignupPromptModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="u-modal-overlay signup-prompt-overlay" onClick={onClose}>
      <div className="u-modal signup-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="u-modal-head">
          <h3>Do&apos;koningizni raqamlashtiring</h3>
          <button type="button" className="u-icon-btn" onClick={onClose} aria-label="Yopish">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="signup-prompt-body">
          <p>
            Savora bilan ombor, sotuv, kassa va filiallarni bir joydan boshqaring.
            <strong> 7 kun bepul</strong> sinab ko&apos;ring — karta talab qilinmaydi.
          </p>
          <ul className="signup-prompt-list">
            <li><Icon name="check" size={14} /> Tez sotuv — skaner pistalet</li>
            <li><Icon name="check" size={14} /> Ko&apos;p filial va xodimlar</li>
            <li><Icon name="check" size={14} /> Qarz va kassa hisoboti</li>
          </ul>
          <div className="signup-prompt-actions">
            <Link href={LOCALHOST_LINKS.register} className="btn btn-primary btn-with-icon">
              <Icon name="signup" size={16} />
              Bepul boshlash
            </Link>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Keyinroq
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
