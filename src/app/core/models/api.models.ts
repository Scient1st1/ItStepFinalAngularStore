/** Models from https://shopapi.stepacademy.ge/swagger/v1/swagger.json */

/** Every successful response is wrapped as `{ data, meta }`. */
export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiMeta {
  name?: string;
  description?: string;
  website?: string;
  location?: string;
  email?: string;
}

/** RFC 7807 error body. */
export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  message?: string;
  errors?: Record<string, string[] | string>;
}

export interface Paged<T> {
  items: T[] | null;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CategoryResponse {
  id: number;
  name: string | null;
  imageUrl: string | null;
  description: string | null;
  productCount: number;
  canDelete: boolean;
}

export interface ProductResponse {
  id: number;
  stock: number;
  name: string | null;
  brand: string | null;
  model: string | null;
  price: number;
  imageUrl: string | null;
  isFavorite: boolean;
  rating: number;
  createdAt: string;
  canDelete: boolean;
  category: CategoryResponse;
}

export interface ProductDetailedResponse {
  id: number;
  stock: number;
  name: string | null;
  brand: string | null;
  model: string | null;
  rating: number;
  price: number;
  imageUrl: string | null;
  isFavorite: boolean;
  description: string | null;
  imageUrls: string[] | null;
  category: CategoryResponse;
  specifications: Record<string, string> | null;
}

export type ProductResponsePaged = Paged<ProductResponse>;

export interface ProductFilter {
  search?: string;
  brand?: string;
  inStock?: boolean;
  sortBy?: string;
  sortDescending?: boolean;
  categoryId?: number;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  take?: number;
  page?: number;
}

export interface CartItemResponse {
  id: number;
  quantity: number;
  price: number;
  totalPrice: number;
  product: ProductResponse;
}

export type CartItemResponsePaged = Paged<CartItemResponse>;

export interface AddToCartRequest {
  productId: number;
  quantity: number;
}

export interface EditCartItemRequest {
  itemId: number;
  quantity: number;
}

export interface UserDetailsResponse {
  phoneNumber: string | null;
  address: string | null;
  dob: string | null;
  pictureUrl: string | null;
}

export interface UserResponse {
  id: number;
  email: string | null;
  role: string | null;
  lastName: string | null;
  firstName: string | null;
  details: UserDetailsResponse;
}

export interface ReviewResponse {
  id: number;
  rating: number;
  createdAt: string;
  user: UserResponse;
}

export type ReviewResponsePaged = Paged<ReviewResponse>;

export interface CreateReviewRequest {
  productId: number;
  rate: number;
}

export interface EditReviewRequest {
  reviewId: number;
  rate: number | null;
}

export interface RegisterRequest {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  password: string | null;
}

export interface LoginRequest {
  email: string | null;
  password: string | null;
}

export interface VerifyEmailRequest {
  email: string | null;
  code: string | null;
}

/** Not in Swagger. Unverified accounts get placeholder tokens containing "Verification". */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
