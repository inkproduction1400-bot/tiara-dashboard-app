// src/lib/types.rides.ts

export type RideListItem = {
    id: string;
    request_date: string;
    status: string;
    pickup_city: string | null;
    car_number: number | null;
    boarding_time: string | null;
    arrival_time: string | null;
    note: string | null;
    created_at: string;
  
    cast: {
      display_name: string;
      management_number: string;
    };
  
    shop: {
      name: string;
    };
  };
  