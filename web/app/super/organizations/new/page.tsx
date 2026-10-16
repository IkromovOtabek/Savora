import { getDict } from '@/lib/i18n/server';
import CreateOrgForm from './CreateOrgForm';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.newOrg.metaTitle };
}

export default function NewOrgPage() {
  return <CreateOrgForm />;
}
