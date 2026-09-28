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
  status: string;
  deposit_amount?: number;
  deposit_percent?: number;
  deposit_paid?: boolean;
  created_at: string;
};
