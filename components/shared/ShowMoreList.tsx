import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { uiText, uiTemplate } from '../../utils/uiI18n';

/** Items shown before the 看更多 toggle appears. */
export const SHOW_MORE_LIMIT = 10;

type ShowMoreListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** Class for the wrapper holding the items (grid / flex / space-y container). */
  className?: string;
  /** Max items shown while collapsed. */
  limit?: number;
  /** Rendered inside the wrapper when `items` is empty. */
  empty?: ReactNode;
  /** Extra spacing class for the toggle (e.g. `mt-2`). */
  toggleClassName?: string;
};

/**
 * Collapse a growing list to `limit` items with an inline 看更多／收起 toggle.
 * The toggle is a sibling of the item wrapper, so it never lands inside the
 * grid/flex container and stays full width.
 */
export function ShowMoreList<T>({
  items,
  renderItem,
  className = '',
  limit = SHOW_MORE_LIMIT,
  empty = null,
  toggleClassName = '',
}: ShowMoreListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, items.length - limit);
  const visible = expanded ? items : items.slice(0, limit);

  return (
    <>
      <div className={className}>
        {visible.length
          ? visible.map((item, index) => <Fragment key={index}>{renderItem(item, index)}</Fragment>)
          : empty}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={`flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-bold text-slate-500 transition-colors hover:text-indigo-600 ${toggleClassName}`}
        >
          {expanded ? uiText('收起') : uiTemplate('看更多（還有 {0} 個）', String(hiddenCount))}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ) : null}
    </>
  );
}
