import { marked } from 'marked';
import manual from '../../1024交易手册.md?raw';
import { Card } from '../components/ui';

const html = marked.parse(manual, { async: false }) as string;

export function ManualView() {
  return (
    <Card>
      <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </Card>
  );
}
