import { getRichTextRuns } from "../utils/richText";

interface RichTextDisplayProps {
  value: string;
}

export const RichTextDisplay = ({ value }: RichTextDisplayProps) => (
  <>
    {getRichTextRuns(value).map((run, index) => (
      <span key={`${index}-${run.text}`} style={run.color ? { color: run.color } : undefined}>
        {run.text}
      </span>
    ))}
  </>
);
