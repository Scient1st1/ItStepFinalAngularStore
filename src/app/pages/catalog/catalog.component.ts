import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import {
  CategoryResponse,
  ProductFilter,
  ProductResponse,
  ProductResponsePaged,
} from '../../core/models/api.models';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { NO_STATUS, Status, apiErrorMessage } from '../../core/utils/helpers';
import { ProductCardComponent } from '../../shared/product-card/product-card.component';

const PAGE_SIZE = 12;

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name';

const SORTS: Record<SortOption, Pick<ProductFilter, 'sortBy' | 'sortDescending'>> = {
  featured: {},
  'price-asc': { sortBy: 'price' },
  'price-desc': { sortBy: 'price', sortDescending: true },
  name: { sortBy: 'name' },
};

/** Mirrors the URL query string. */
interface Criteria {
  search: string;
  category: string;
  brand: string;
  rating: string;
  minPrice: number | null;
  maxPrice: number | null;
  sort: SortOption;
  page: number;
}

function toNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function readCriteria(params: ParamMap): Criteria {
  const sort = params.get('sort') ?? '';
  const page = Math.floor(Number(params.get('page')));
  return {
    search: params.get('q') ?? '',
    category: params.get('category') ?? '',
    brand: params.get('brand') ?? '',
    rating: params.get('rating') ?? '',
    minPrice: toNumber(params.get('min')),
    maxPrice: toNumber(params.get('max')),
    sort: sort in SORTS ? (sort as SortOption) : 'featured',
    page: page >= 1 ? page : 1,
  };
}

/** null drops the parameter. */
function toQueryParams(criteria: Criteria): Record<string, string | number | null> {
  return {
    q: criteria.search.trim() || null,
    category: criteria.category || null,
    brand: criteria.brand || null,
    rating: criteria.rating || null,
    min: criteria.minPrice,
    max: criteria.maxPrice,
    sort: criteria.sort === 'featured' ? null : criteria.sort,
    page: criteria.page > 1 ? criteria.page : null,
  };
}

function toFilter(criteria: Criteria): ProductFilter {
  return {
    search: criteria.search.trim() || undefined,
    categoryId: Number(criteria.category) || undefined,
    brand: criteria.brand || undefined,
    minRating: Number(criteria.rating) || undefined,
    minPrice: criteria.minPrice ?? undefined,
    maxPrice: criteria.maxPrice ?? undefined,
    ...SORTS[criteria.sort],
    take: PAGE_SIZE,
    page: criteria.page,
  };
}

function priceRange(group: AbstractControl): ValidationErrors | null {
  const min = group.get('minPrice')?.value;
  const max = group.get('maxPrice')?.value;
  if ((min !== null && min < 0) || (max !== null && max < 0)) return { negativePrice: true };
  return min !== null && max !== null && min > max ? { priceRange: true } : null;
}

/** Filters live in the URL query string. */
@Component({
  selector: 'app-catalog',
  imports: [ReactiveFormsModule, ProductCardComponent],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.css',
})
export class CatalogComponent {
  private readonly productService = inject(ProductService);
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly ratingOptions = [4, 3, 2, 1];

  protected readonly form = this.fb.group(
    {
      search: [''],
      category: [''],
      brand: [''],
      rating: [''],
      minPrice: [null as number | null],
      maxPrice: [null as number | null],
      sort: ['featured' as SortOption],
    },
    { validators: priceRange },
  );

  protected readonly categories = signal<CategoryResponse[]>([]);
  protected readonly brands = signal<string[]>([]);
  protected readonly optionsError = signal<string | null>(null);

  protected readonly result = signal<ProductResponsePaged | null>(null);
  protected readonly products = computed<ProductResponse[]>(() => this.result()?.items ?? []);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly totalPages = computed(() => this.result()?.totalPages ?? 0);
  protected readonly hasFilters = signal(false);

  private readonly message = signal<Status>(NO_STATUS);
  private readonly formError = signal<string | null>(null);
  protected readonly addingId = signal<number | null>(null);

  protected readonly statusLine = computed<Status>(() => {
    const formError = this.formError();
    if (formError) return { text: formError, error: true };
    if (this.message().text) return this.message();
    const result = this.result();
    if (this.loading()) return { text: 'Loading…', error: false };
    if (this.error() || !result) return NO_STATUS;
    const count = result.totalCount;
    return { text: `${count} ${count === 1 ? 'piece' : 'pieces'}`, error: false };
  });

  private readonly reload$ = new BehaviorSubject<void>(undefined);
  /** The query string this component last wrote, to tell its own navigation from Back/Forward. */
  private lastWritten: string | null = null;
  private currentQuery = '';

  constructor() {
    this.loadOptions();

    // URL → form → request.
    combineLatest([this.route.queryParamMap.pipe(map(readCriteria)), this.reload$])
      .pipe(
        tap(([criteria]) => this.syncFromUrl(criteria)),
        switchMap(([criteria]) =>
          this.productService.filterProducts(toFilter(criteria)).pipe(
            map((result) => ({ result, error: null as string | null })),
            catchError((error: unknown) =>
              of({ result: null, error: apiErrorMessage(error, 'Could not load products.') }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ result, error }) => {
        this.loading.set(false);
        this.error.set(error);
        this.result.set(result);
      });

    // Form → URL, debounced.
    this.form.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
  }

  protected loadOptions(): void {
    this.optionsError.set(null);
    forkJoin({
      categories: this.productService.getCategories(),
      brands: this.productService.getBrands(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ categories, brands }) => {
          this.categories.set(categories);
          this.brands.set(brands);
        },
        error: (error: unknown) =>
          this.optionsError.set(
            apiErrorMessage(error, 'Could not load the category and brand lists.'),
          ),
      });
  }

  protected applyFilters(): void {
    if (this.form.invalid) {
      this.formError.set(
        this.form.hasError('priceRange')
          ? 'The minimum price cannot be higher than the maximum.'
          : 'Prices cannot be negative.',
      );
      return;
    }
    this.formError.set(null);
    this.navigate({ ...this.form.getRawValue(), page: 1 });
  }

  protected clearFilters(): void {
    this.form.reset(undefined, { emitEvent: false });
    this.applyFilters();
  }

  protected goToPage(page: number): void {
    this.navigate({ ...this.form.getRawValue(), page });
  }

  protected retry(): void {
    this.reload$.next();
  }

  protected add(product: ProductResponse): void {
    this.addingId.set(product.id);
    this.cart
      .addProduct(product)
      .pipe(
        finalize(() => this.addingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (text) => this.message.set({ text, error: false }),
        error: (error: unknown) =>
          this.message.set({
            text: apiErrorMessage(error, 'Could not add that to your basket.'),
            error: true,
          }),
      });
  }

  private navigate(criteria: Criteria): void {
    const queryParams = toQueryParams(criteria);
    const written = JSON.stringify(queryParams);
    if (written === this.currentQuery) return; // Already showing exactly this.
    this.lastWritten = written;
    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  private syncFromUrl(criteria: Criteria): void {
    const query = JSON.stringify(toQueryParams(criteria));
    // Only overwrite the form when the URL changed from outside (Back/Forward, a link).
    if (query !== this.lastWritten) {
      const { page: _page, ...values } = criteria;
      this.form.setValue(values, { emitEvent: false });
      this.formError.set(null);
    }
    this.lastWritten = null;
    this.currentQuery = query;
    this.page.set(criteria.page);
    this.hasFilters.set(
      Object.values(toQueryParams({ ...criteria, page: 1 })).some((value) => value !== null),
    );
    this.message.set(NO_STATUS);
    this.loading.set(true);
    this.error.set(null);
  }
}
