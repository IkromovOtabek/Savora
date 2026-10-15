'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
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
        aria-label={show ? 'Parolni yashirish' : "Parolni ko'rsatish"}
        aria-pressed={show}
        aria-controls={id}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={19} />
      </button>
    </div>
  );
}
