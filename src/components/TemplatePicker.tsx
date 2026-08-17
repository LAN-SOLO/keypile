import { useApp } from '../App';
import { CATEGORIES, Category } from '../templates';
import { CategoryIcon } from '../icons';

interface Props {
  onPick: (cat: Category) => void;
  onClose: () => void;
}

export default function TemplatePicker({ onPick, onClose }: Props) {
  const { t } = useApp();
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{t.chooseTemplate}</h3>
          <button className="ghost icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mbody">
          <div className="template-grid">
            {CATEGORIES.map((cat) => (
              <button key={cat} className="template-tile" onClick={() => onPick(cat)}>
                <CategoryIcon category={cat} size={26} />
                <span>{t.categories[cat]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
