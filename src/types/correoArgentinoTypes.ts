export interface CorreoArgentinoAddress {
  streetName: string;
  streetNumber: string;
  cityName: string;
  floor?: string;
  department?: string;
  state: string; // Province code (A, B, C, etc.)
  zipCode: string;
}

export interface CorreoArgentinoContact {
  name?: string; // used in shippingData
  businessName?: string; // used in senderData
  areaCodePhone?: string;
  phoneNumber?: string;
  areaCodeCellphone?: string;
  cellphoneNumber?: string;
  email?: string;
  observation?: string;
  address: CorreoArgentinoAddress;
}

export interface CorreoArgentinoSenderData extends CorreoArgentinoContact {
  id: string; // or number? Manual says "string" for id but example says 5. We'll use string.
}

export interface CorreoArgentinoShippingData extends CorreoArgentinoContact {}

export interface CorreoArgentinoParcel {
  dimensions: {
    height: string; // cm
    width: string; // cm
    depth: string; // cm
  };
  productWeight: string; // grams
  productCategory: string;
  declaredValue: string; // value
}

export interface CorreoArgentinoOrderRequest {
  sellerId?: string;
  trackingNumber?: string;
  order: {
    senderData: CorreoArgentinoSenderData;
    shippingData: CorreoArgentinoShippingData;
    parcels: CorreoArgentinoParcel[];
    deliveryType: 'agency' | 'locker' | 'homeDelivery';
    agencyId?: string; // Required if deliveryType is agency
    saleDate: string; // YYYY-MM-DDTHH:mm:ss-03:00
    shipmentClientId?: string;
    serviceType: string; // CP (Paqueteria clasica)
  };
}

export interface CorreoArgentinoOrderResponse {
  idSeller: string;
  trackingNumber: string;
  // returns the order object
  senderData: any;
  shippingData: any;
  parcels: any[];
  deliveryType: string;
  agencyId: string;
  saleDate: string;
  serviceType: string;
  shipmentClientId: string;
}

export interface CorreoArgentinoLabelRequestItem {
  sellerId?: string;
  trackingNumber: string;
}

export interface CorreoArgentinoLabelResponseItem {
  trackingNumber: string;
  fileBase64: string;
  fileName: string;
  result: string; // "OK" or "ERROR: ..."
}

export interface CorreoArgentinoTrackingEvent {
  facilityId?: string;
  facilityCode?: string;
  facility: string;
  statusId: string;
  status: string;
  date: string;
  sign: string;
}

export interface CorreoArgentinoTrackingResponseItem {
  id?: string | null;
  quantity: number;
  countryId?: string | null;
  serviceType?: string | null;
  trackingNumber: string;
  event: CorreoArgentinoTrackingEvent[];
}

export interface CorreoArgentinoAgency {
  location: {
    geolocation: {
      latitude: string;
      longitude: string;
    };
    country_name: string;
    state_name: string;
    city_name: string;
    city_id: string;
    neighborhood_name: string;
    street_name: string;
    street_number: string;
    zip_code: string;
  };
  status: any;
  schedule: string;
  owner: string;
  email: string;
  phone: string;
  agency_id: string;
  agency_name: string;
  package_reception: boolean;
  pickup_availability: boolean;
  open_hours: any;
  last_updated: any;
  deactivation_date: any;
  volumetric_capacity: any;
  maximum_package_dimensions: {
    height: any;
    length: any;
    width: any;
    weight: any;
  };
}

// Strict typings for PAQ.AR integration
export interface ShippingCostParams {
  originCp: string;
  destinationCp: string;
  weight: number;
  volume?: number;
}

export interface ShippingCostResponse {
  price: number;
  currency: string;
}

export interface Direccion {
  calle: string;
  numero: string;
  piso?: string;
  depto?: string;
  codigoPostal: string;
  localidad: string;
  provincia: string;
}

export interface Persona extends Direccion {
  nombre: string;
  email: string;
  telefono: string;
}

export interface OrderData {
  numeroContrato: string;
  cuentaCorreo: string;
  remitente: Direccion & { nombre: string };
  destinatario: Persona;
  operativa: 'D' | 'S'; // 'D' = Home Delivery, 'S' = Branch Pickup
  paquete?: {
    peso: number;
    volumen?: number;
  };
}

export interface OrderResponse {
  trackingNumber: string;
  labelPdfBase64: string;
}
