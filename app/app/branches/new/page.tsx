import { redirect } from 'next/navigation';

export default function NewBranchRedirect() {
  redirect('/app/users#filial');
}
