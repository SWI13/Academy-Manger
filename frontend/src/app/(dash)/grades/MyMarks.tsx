import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDate } from "@/lib/format";
import type { Score } from "@/types";

import { percent } from "./GradebookTable";

/**
 * A student's own marks, across every course they have taken.
 *
 * Only published marks reach this list - the scoped queryset filters
 * unpublished ones out on the backend, so there is nothing here to hide. The
 * "corrected" note is deliberate: a professor may change a mark at any time
 * (architecture D-7), and a mark that quietly changed between two visits is
 * worse than one that says it changed.
 */
const COLUMNS: Column<Score>[] = [
  {
    key: "assessment",
    header: "Assessment",
    cell: (score) => (
      <div>
        <p className="font-medium text-ink">{score.assessment_title}</p>
        <p className="text-xs text-ink-faint">
          {score.course_title}{" "}
          <span className="tabular">{score.course_public_id}</span>
        </p>
      </div>
    ),
  },
  {
    key: "kind",
    header: "Type",
    secondary: true,
    cell: (score) => (
      <span className="text-ink-soft">
        {score.assessment_kind.toLowerCase()}
      </span>
    ),
  },
  {
    key: "score",
    header: "Mark",
    numeric: true,
    cell: (score) => (
      <span className="font-medium text-ink">
        {Number(score.score)} / {Number(score.max_score)}
      </span>
    ),
  },
  {
    key: "percentage",
    header: "Percent",
    numeric: true,
    cell: (score) => percent(score.percentage),
  },
  {
    key: "entered",
    header: "Recorded",
    secondary: true,
    cell: (score) => (
      <div className="text-xs text-ink-faint">
        <p>{formatDate(score.entered_at)}</p>
        {score.was_edited ? (
          <p className="text-warn">
            corrected {formatDate(score.last_changed_at)}
          </p>
        ) : null}
      </div>
    ),
  },
];

export function MyMarks({ marks }: { marks: Score[] }) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Your marks
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Published results only. A mark appears here once your professor
          releases the assessment it belongs to.
        </p>
      </header>

      <DataTable
        caption="Your marks"
        columns={COLUMNS}
        rows={marks}
        rowKey={(score) => String(score.id)}
        empty="No marks published yet."
      />

      {marks.some((score) => score.was_edited) ? (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Badge tone="warn">Corrected</Badge>
          One or more of these was changed after it was first recorded. Marks
          do not lock, so a professor can put right a mistake at any point.
        </p>
      ) : null}
    </div>
  );
}
