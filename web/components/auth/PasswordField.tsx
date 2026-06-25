'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';

interface Props {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  defaultValue?: string;
}

export default function PasswordField({ id, name, autoComplete, required, minLength, disabled, defaultValue }: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className="auth-pwd">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        disabled={disabled}
        defaultValue={defaultValue}
      />
      <button
        type="button"
        className="auth-pwd-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Parolni yashirish' : "Parolni ko'rsatish"}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}
