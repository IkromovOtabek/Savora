'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import './auth.css';

interface Props {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  defaultValue?: string;
  placeholder?: string;
}

/** iOS uslubidagi parol maydoni — o'ngda ko'z tugmasi (ko'rsatish/yashirish) */
export default function PasswordField({ id, name, autoComplete, required, minLength, disabled, defaultValue, placeholder }: Props) {
  const [show, setShow] = useState(false);
  const d = useDict();

  return (
    <div className="au-pwd">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        disabled={disabled}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="au-pwd-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? d.auth.fields.hidePassword : d.auth.fields.showPassword}
        aria-pressed={show}
        aria-controls={id}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={19} />
      </button>
    </div>
  );
}
