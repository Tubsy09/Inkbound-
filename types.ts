export type Parlour = {
  id: string;
  name: string;
  tagline: string;
  address: string;
  latitude: number;
  longitude: number;
  cover: string;
  gallery: string[];
  styles: string[];
  rating: number;
  review_count: number;
  price_level: string;
  hours: string;
};

export type Artist = {
  id: string;
  parlour_id: string;
  name: string;
  avatar: string;
  specialty: string;
  bio: string;
  styles: string[];
  rating: number;
  years: number;
  portfolio: string[];
};

export type Service = {
  id: string;
  parlour_id: string;
  name: string;
  style: string;
  price: number;
  /** Artist's fixed deposit in $; null/undefined = studio default percentage */
  deposit?: number | null;
  /** Effective deposit in $ (computed by the server) */
  deposit_amount?: number;
  duration_min: number;
};

export type Review = {
  id: string;
  parlour_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type Booking = {
  id: string;
  user_id: string;
  customer_name: string;
  artist_id: string;
  artist_name: string;
  artist_avatar?: string;
  parlour_id: string;
  parlour_name: string;
  service_id: string;
  service_name: string;
  style: string;
  price: number;
  date: string;
  time: string;
  note: string;
  reference_images?: string[];
  status: string;
  deposit_amount?: number;
  deposit_percent?: number;
  deposit_paid?: boolean;
  /** Set when a booking with a paid deposit is cancelled/declined: how much is owed back */
  refund_amount?: number;
  /** "due" = owed to the client and still to be sent; "none" = deposit kept under the cancellation policy */
  refund_status?: "due" | "none" | string;
  cancelled_by?: "artist" | "client";
  /** Customer's own bookings: what they'd get back if they cancelled right now (paid deposits only) */
  cancel_refund?: number;
  created_at: string;
};

export type JoinRequest = {
  id: string;
  artist_id: string;
  artist_name: string;
  artist_avatar?: string | null;
  artist_specialty?: string;
  parlour_id: string;
  parlour_name: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  created_at: string;
};

export type StudioMe = {
  artist: any | null;
  parlour: any | null;
  /** true when the signed-in artist runs the studio they work at */
  is_owner: boolean;
  pending_request: JoinRequest | null;
  pending_requests_count: number;
};
