import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, map, reduce, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  CategoryResponse,
  CreateReviewRequest,
  EditReviewRequest,
  ProductDetailedResponse,
  ProductFilter,
  ProductResponse,
  ProductResponsePaged,
  ReviewResponsePaged,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/api`;

  private categories$?: Observable<CategoryResponse[]>;
  private allProducts$?: Observable<ProductResponse[]>;

  /** GET /api/products */
  getProducts(take: number, page = 1): Observable<ProductResponsePaged> {
    const params = new HttpParams().set('Take', take).set('Page', page);
    return this.http
      .get<ApiResponse<ProductResponsePaged>>(`${this.api}/products`, { params })
      .pipe(map((response) => response.data));
  }

  /** GET /api/products/filter */
  filterProducts(filter: ProductFilter): Observable<ProductResponsePaged> {
    const entries: Array<[string, string | number | boolean | undefined]> = [
      ['Search', filter.search],
      ['Brand', filter.brand],
      ['InStock', filter.inStock],
      ['SortBy', filter.sortBy],
      ['SortDescending', filter.sortDescending],
      ['CategoryId', filter.categoryId],
      ['MinRating', filter.minRating],
      ['MinPrice', filter.minPrice],
      ['MaxPrice', filter.maxPrice],
      ['Take', filter.take],
      ['Page', filter.page],
    ];
    let params = new HttpParams();
    for (const [name, value] of entries) {
      if (value !== undefined && value !== '') params = params.set(name, value);
    }
    return this.http
      .get<ApiResponse<ProductResponsePaged>>(`${this.api}/products/filter`, { params })
      .pipe(map((response) => response.data));
  }

  /** GET /api/products/{productId} */
  getProduct(id: number): Observable<ProductDetailedResponse> {
    return this.http
      .get<ApiResponse<ProductDetailedResponse>>(`${this.api}/products/${id}`)
      .pipe(map((response) => response.data));
  }

  /** GET /api/categories — cached. */
  getCategories(): Observable<CategoryResponse[]> {
    return (this.categories$ ??= this.http
      .get<ApiResponse<CategoryResponse[]>>(`${this.api}/categories`)
      .pipe(
        map((response) => response.data ?? []),
        catchError((error: unknown) => {
          this.categories$ = undefined;
          return throwError(() => error);
        }),
        shareReplay(1),
      ));
  }

  /** No brands endpoint: derived from the products. */
  getBrands(): Observable<string[]> {
    return this.getAllProducts().pipe(
      map((products) =>
        [...new Set(products.map((p) => p.brand).filter((brand): brand is string => !!brand))].sort(
          (a, b) => a.localeCompare(b),
        ),
      ),
    );
  }

  /** Details have no date: createdAt is looked up in the product list. */
  getReleaseDate(productId: number): Observable<string | null> {
    return this.getAllProducts().pipe(
      map((products) => products.find((p) => p.id === productId)?.createdAt ?? null),
    );
  }

  /** GET /api/reviews/{productId} */
  getReviews(productId: number, take = 100, page = 1): Observable<ReviewResponsePaged> {
    const params = new HttpParams().set('Take', take).set('Page', page);
    return this.http
      .get<ApiResponse<ReviewResponsePaged>>(`${this.api}/reviews/${productId}`, { params })
      .pipe(map((response) => response.data));
  }

  /** totalCount of a one-item page. */
  getReviewCount(productId: number): Observable<number> {
    return this.getReviews(productId, 1).pipe(map((reviews) => reviews.totalCount));
  }

  /** POST /api/reviews */
  addReview(body: CreateReviewRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.api}/reviews`, body);
  }

  /** PUT /api/reviews */
  editReview(body: EditReviewRequest): Observable<unknown> {
    return this.http.put<unknown>(`${this.api}/reviews`, body);
  }

  /** All products, page by page, cached. */
  private getAllProducts(): Observable<ProductResponse[]> {
    const maxPages = 20;
    return (this.allProducts$ ??= this.getProducts(100, 1).pipe(
      expand((result) =>
        result.hasMore && result.currentPage < Math.min(result.totalPages, maxPages)
          ? this.getProducts(100, result.currentPage + 1)
          : EMPTY,
      ),
      reduce((all, result) => all.concat(result.items ?? []), [] as ProductResponse[]),
      catchError((error: unknown) => {
        this.allProducts$ = undefined;
        return throwError(() => error);
      }),
      shareReplay(1),
    ));
  }
}
