import { Label } from "@/components/ui/label";
import { DURATION_PRESETS } from "@/lib/duration-presets";

interface DurationSelectProps {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  disabled?: boolean;
}

export function DurationSelect({ value, onValueChange, disabled }: DurationSelectProps) {
  const handleValueChange = (selectedValue: string) => {
    // Ignore empty string changes - this seems to be a spurious event from the Select component
    if (selectedValue === "") {
      return;
    }

    let duration: number | null;
    if (selectedValue === "forever") {
      duration = null;
    } else {
      const parsed = parseInt(selectedValue);
      duration = isNaN(parsed) ? null : parsed;
    }
    onValueChange(duration);
  };

  const getSelectValue = () => {
    if (value === null || value === undefined || isNaN(value as number)) {
      return "forever";
    }
    return value.toString();
  };

  const selectValue = getSelectValue();

  return (
    <div className="space-y-2">
      <Label htmlFor="duration">Auto-disable Duration</Label>
      <select
        id="duration"
        value={selectValue}
        onChange={(event) => handleValueChange(event.target.value)}
        disabled={disabled}
        className="h-10 min-w-32 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {DURATION_PRESETS.map((preset) => (
          <option
            key={preset.value === null ? "forever" : preset.value.toString()}
            value={preset.value === null ? "forever" : preset.value.toString()}
          >
            {preset.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500">
        Service will automatically disable after this duration.
      </p>
    </div>
  );
}