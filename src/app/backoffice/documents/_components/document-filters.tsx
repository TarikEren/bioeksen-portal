"use client";

/**
 * The search and the product filter of the list of documents (IFU-10 screens,
 * stage B3 UI table).
 *
 * The filters are in the URL (`?q=`, `?productId=`), so a link opens the same
 * view (`sds-nextjs-frontend` §7). A submit builds the query and navigates, and
 * it drops the page number, because a new search starts on page one. An empty
 * value is left out of the URL. The product choice shows only when the page has
 * the options, which needs `catalog.product.view`. The server reads and
 * validates the query.
 */
import { Button, Form, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProductOption } from "./product-select";

/** The key of the choice "all products" in the select. */
const ALL_PRODUCTS = "all";

interface DocumentFiltersProps {
  readonly basePath: string;
  /** The values of the current view. `productId` is `null` for all products. */
  readonly defaults: { readonly q: string; readonly productId: string | null };
  /** The products to filter by, or `null` when the person may not read the catalog. */
  readonly products: readonly ProductOption[] | null;
  readonly labels: {
    readonly form: string;
    readonly search: string;
    readonly placeholder: string;
    readonly product: string;
    readonly anyProduct: string;
    readonly submit: string;
  };
}

export function DocumentFilters({ basePath, defaults, products, labels }: DocumentFiltersProps) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>(
    products?.find((option) => option.id === defaults.productId)?.id ?? ALL_PRODUCTS,
  );

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
        if (productId !== ALL_PRODUCTS) {
          query.set("productId", productId);
        }
        const text = query.toString();
        router.push(text === "" ? basePath : `${basePath}?${text}`);
      }}
    >
      <TextField name="q" defaultValue={defaults.q} className="min-w-64 flex-1">
        <Label>{labels.search}</Label>
        <Input placeholder={labels.placeholder} />
      </TextField>
      {products === null ? null : (
        <Select
          value={productId}
          onChange={(value) => setProductId(products.find((option) => option.id === value)?.id ?? ALL_PRODUCTS)}
          className="w-64"
        >
          <Label>{labels.product}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id={ALL_PRODUCTS} textValue={labels.anyProduct}>
                {labels.anyProduct}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {products.map((option) => (
                <ListBox.Item key={option.id} id={option.id} textValue={`${option.code} ${option.status} ${option.name}`}>
                  <span className="font-mono">{option.code}</span> <span>{option.status}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}
      <Button type="submit" variant="secondary">
        {labels.submit}
      </Button>
    </Form>
  );
}
