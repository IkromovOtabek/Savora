import Link from 'next/link';
import Icon from '@/components/icons/Icon';

interface Props {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export default function BackLink({ href, children, className = 'back-link' }: Props) {
  return (
    <Link href={href} className={`${className} btn-with-icon`}>
      <Icon name="arrowLeft" size={16} />
      {children}
    </Link>
  );
}
