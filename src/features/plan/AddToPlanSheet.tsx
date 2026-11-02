import { useState } from 'react';
import { Button, Chip, Field, selectClass, Sheet, Stepper, useFeedback } from '../../components/ui';
import type { MealSlot } from '../../domain/types';
import { addDays, weekStartOf } from '../../state/db';
import { useHousehold } from '../../state/hooks';
import { addMeal } from './planActions';

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function AddToPlanSheet({ open, onClose, recipeId, servings }: { open: boolean; onClose: () => void; recipeId: string; servings: number }) {
  const household = useHousehold();
  const { toast } = useFeedback();
  const thisWeek = weekStartOf();
  const nextWeek = weekStartOf(addDays(thisWeek, 7));
  const [week, setWeek] = useState(thisWeek);
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [count, setCount] = useState(servings);
  const slots: MealSlot[] = household.showBreakfastSnacks ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['lunch', 'dinner'];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add to plan"
      footer={<Button className="mb-1 w-full" data-testid="confirm-add-plan" onClick={() => { void addMeal(week, day, slot, recipeId, count); toast(`On the plan for ${DAY_NAMES[day]}.`); onClose(); }}>Add it</Button>}
    >
      <div className="space-y-4">
        <Field label="Week">
          <select className={selectClass} value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value={thisWeek}>This week</option>
            <option value={nextWeek}>Next week</option>
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Day</legend>
          <div className="flex flex-wrap gap-2">{DAY_NAMES.map((d, i) => <Chip key={d} active={day === i} onClick={() => setDay(i)}>{d}</Chip>)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Meal</legend>
          <div className="flex flex-wrap gap-2">{slots.map((s) => <Chip key={s} active={slot === s} className="capitalize" onClick={() => setSlot(s)}>{s}</Chip>)}</div>
        </fieldset>
        <div className="flex items-center justify-between"><span className="text-sm font-bold">Servings</span><Stepper label="servings" value={count} onChange={setCount} /></div>
      </div>
    </Sheet>
  );
}
