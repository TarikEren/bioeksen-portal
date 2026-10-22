"use client";

/**
 * The search and the state filter of the product list (CAT-10 screens, stage B2
 * UI table).
 *
 * The filters are in the URL (`?q=`, `?active=`), so a link opens the same view
 * (`sds-nextjs-frontend` §7). A submit builds the query and navigates, and it
 * drops the page number, because a new search starts on page one. An empty value
 * is left out of the URL. The select holds the display choice only; the server
 * reads and validates the query.
 */
import { Button, Form, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STATE_KEYS = ["all", "true", "false"] as const;
type StateKey = (typeof STATE_KEYS)[number];

interface ProductFiltersProps {
  readonly basePath: string;
  /** The values of the current view. */
  readonly defaults: { readonly q: string; readonly active: StateKey };
  readonly labels: {
    readonly form: string;
    readonly search: string;
    readonly placeholder: string;
    readonly state: string;
    readonly any: string;
    readonly active: string;
    readonly inactive: string;
    readonly submit: string;
  };
}

function stateKeyOf(value: string | number | null): StateKey {
  return STATE_KEYS.find((key) => key === value) ?? "all";
}

export function ProductFilters({ basePath, defaults, labels }: ProductFiltersProps) {
  const router = useRouter();
  const [state, setState] = useState<StateKey>(defaults.active);
  const stateLabels: Readonly<Record<StateKey, string>> = { all: labels.any, true: labels.active, false: labels.inactive };

  return (
    <Form
      validationBehavior="aria"
      aria-label={labels.form}
      className="flex flex-wrap items-end gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = new FormData(event.currentTarget).get("q");
        const q = typeof typed === "string" ? typed.trim() : "";
        const query = new URLSearchParams();
        if (q !== "") {
          query.set("q", q);
        }
        if (state !== "all") {
          query.set("active", state);
        }
        const text = query.toString();
        router.push(text === "" ? basePath : `${basePath}?${text}`);
      }}
    >
      <TextField name="q" defaultValue={defaults.q} className="min-w-64 flex-1">
        <Label>{labels.search}</Label>
        <Input placeholder={labels.placeholder} />
      </TextField>
      <Select value={state} onChange={(value) => setState(stateKeyOf(value))} className="w-48">
        <Label>{labels.state}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {STATE_KEYS.map((key) => (
              <ListBox.Item key={key} id={key} textValue={stateLabels[key]}>
                {stateLabels[key]}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Button type="submit" variant="secondary">
        {labels.submit}
      </Button>
    </Form>
  );
}
