"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ticketCategoryCreateInputSchema,
  ticketCategoryInputSchema,
  ticketCategoryUpdateInputSchema,
} from "@nujum/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";
import {
  createTicketCategoryAction,
  deleteTicketCategoryAction,
  updateTicketCategoryAction,
} from "../app/actions/config";
import type { TicketCategoryView } from "../lib/data";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { FieldError, Input, Label, Select, Textarea, Toggle } from "./ui/form";

type CategoryFormInput = z.input<typeof ticketCategoryInputSchema>;
type CategoryFormOutput = z.output<typeof ticketCategoryInputSchema>;

const EMPTY_CATEGORY: CategoryFormInput = {
  name: "",
  emoji: null,
  description: null,
  discordCategoryId: null,
  supportRoleIds: [],
  formFields: [],
  position: 0,
  enabled: true,
};

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function CategoryEditor({
  guildId,
  category,
  onDone,
}: {
  guildId: string;
  category: TicketCategoryView | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormInput, unknown, CategoryFormOutput>({
    resolver: zodResolver(ticketCategoryInputSchema),
    defaultValues: category ?? EMPTY_CATEGORY,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "formFields" });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const parsed = category
        ? ticketCategoryUpdateInputSchema.safeParse({ ...values, id: category.id })
        : ticketCategoryCreateInputSchema.safeParse(values);
      if (!parsed.success) {
        toast.error("Invalid category", { description: parsed.error.issues[0]?.message });
        return;
      }
      const result = category
        ? await updateTicketCategoryAction(guildId, parsed.data)
        : await createTicketCategoryAction(guildId, parsed.data);
      if (result.ok) {
        toast.success(category ? "Category updated" : "Category created", {
          description: `Config version ${result.data.version}`,
        });
        onDone();
      } else {
        toast.error("Could not save category", { description: result.error });
      }
    });
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-2xl border bg-background/40 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category-name">Name</Label>
          <Input id="category-name" maxLength={80} {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="category-emoji">Emoji</Label>
          <Input
            id="category-emoji"
            maxLength={64}
            placeholder="🎫"
            {...register("emoji", { setValueAs: optionalId })}
          />
          <FieldError message={errors.emoji?.message} />
        </div>
        <div>
          <Label htmlFor="category-description">Description</Label>
          <Input
            id="category-description"
            maxLength={200}
            {...register("description", { setValueAs: optionalId })}
          />
          <FieldError message={errors.description?.message} />
        </div>
        <div>
          <Label htmlFor="category-discord-id">Discord category id</Label>
          <Input
            id="category-discord-id"
            placeholder="123456789012345678"
            {...register("discordCategoryId", { setValueAs: optionalId })}
          />
          <FieldError message={errors.discordCategoryId?.message} />
        </div>
        <div>
          <Label htmlFor="category-roles">Support role ids</Label>
          <Controller
            control={control}
            name="supportRoleIds"
            render={({ field }) => (
              <Textarea
                id="category-roles"
                defaultValue={field.value.join(", ")}
                onChange={(event) => field.onChange(splitList(event.target.value))}
                placeholder="123456789012345678, 987654321098765432"
              />
            )}
          />
          <FieldError message={errors.supportRoleIds?.message} />
        </div>
        <div>
          <Label htmlFor="category-position">Position</Label>
          <Input
            id="category-position"
            type="number"
            {...register("position", { valueAsNumber: true })}
          />
          <FieldError message={errors.position?.message} />
        </div>
      </div>

      <Controller
        control={control}
        name="enabled"
        render={({ field }) => (
          <Toggle
            label="Enabled"
            description="Show this category on the ticket panel."
            checked={field.value ?? true}
            onChange={field.onChange}
          />
        )}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Form fields</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              append({ key: "", label: "", placeholder: "", required: false, style: "SHORT" })
            }
            disabled={fields.length >= 10}
          >
            <Plus className="h-3.5 w-3.5" /> Add field
          </Button>
        </div>
        <FieldError message={errors.formFields?.message} />
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-xl border bg-surface/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <Label htmlFor={`field-key-${index}`}>Key</Label>
              <Input
                id={`field-key-${index}`}
                placeholder="details"
                {...register(`formFields.${index}.key`)}
              />
              <FieldError message={errors.formFields?.[index]?.key?.message} />
            </div>
            <div>
              <Label htmlFor={`field-label-${index}`}>Label</Label>
              <Input
                id={`field-label-${index}`}
                placeholder="Details"
                {...register(`formFields.${index}.label`)}
              />
              <FieldError message={errors.formFields?.[index]?.label?.message} />
            </div>
            <div>
              <Label htmlFor={`field-placeholder-${index}`}>Placeholder</Label>
              <Input
                id={`field-placeholder-${index}`}
                {...register(`formFields.${index}.placeholder`)}
              />
            </div>
            <div>
              <Label htmlFor={`field-style-${index}`}>Style</Label>
              <Select id={`field-style-${index}`} {...register(`formFields.${index}.style`)}>
                <option value="SHORT">Short</option>
                <option value="PARAGRAPH">Paragraph</option>
              </Select>
            </div>
            <div>
              <Label htmlFor={`field-min-${index}`}>Min length</Label>
              <Input
                id={`field-min-${index}`}
                type="number"
                {...register(`formFields.${index}.minLength`, { setValueAs: optionalNumber })}
              />
            </div>
            <div>
              <Label htmlFor={`field-max-${index}`}>Max length</Label>
              <Input
                id={`field-max-${index}`}
                type="number"
                {...register(`formFields.${index}.maxLength`, { setValueAs: optionalNumber })}
              />
            </div>
            <label className="flex items-center gap-2 self-end text-xs text-muted">
              <input type="checkbox" {...register(`formFields.${index}.required`)} /> Required
            </label>
            <Button variant="danger" size="sm" className="self-end" onClick={() => remove(index)}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : category ? "Save category" : "Create category"}
        </Button>
      </div>
    </form>
  );
}

export function TicketCategoryManager({
  guildId,
  categories,
}: {
  guildId: string;
  categories: TicketCategoryView[];
}) {
  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; category: TicketCategoryView } | null
  >(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(category: TicketCategoryView): void {
    startTransition(async () => {
      const result = await deleteTicketCategoryAction(guildId, { id: category.id });
      if (result.ok) {
        toast.success("Category deleted", {
          description: `Config version ${result.data.version}`,
        });
        setConfirmingId(null);
        if (editor?.mode === "edit" && editor.category.id === category.id) setEditor(null);
      } else {
        toast.error("Could not delete category", { description: result.error });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Ticket categories</CardTitle>
          <CardDescription>
            Each category can have its own support roles and intake form.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5" /> New category
        </Button>
      </CardHeader>

      {editor ? (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              {editor.mode === "edit" ? `Edit ${editor.category.name}` : "New category"}
            </h4>
            <Button variant="ghost" size="sm" onClick={() => setEditor(null)}>
              Cancel
            </Button>
          </div>
          <CategoryEditor
            key={editor.mode === "edit" ? editor.category.id : "new"}
            guildId={guildId}
            category={editor.mode === "edit" ? editor.category : null}
            onDone={() => setEditor(null)}
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {categories.length === 0 ? (
          <p className="text-sm text-muted">No categories yet. Create one to publish a panel.</p>
        ) : (
          categories.map((category) => (
            <div
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden>{category.emoji ?? "🎫"}</span>
                  {category.name}
                  <Badge tone={category.enabled ? "success" : "neutral"}>
                    {category.enabled ? "enabled" : "disabled"}
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-muted">
                  Position {category.position} · {category.formFields.length} form field(s) ·{" "}
                  {category.supportRoleIds.length} support role(s)
                  {category.description ? ` · ${category.description}` : ""}
                </p>
              </div>
              {confirmingId === category.id ? (
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    onClick={() => remove(category)}
                  >
                    Confirm delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditor({ mode: "edit", category })}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingId(category.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
