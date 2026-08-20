/* ============================================
   SpareDriver Constants
   ============================================ */

export const APP_NAME = 'SpareDriver';
export const APP_TAGLINE = 'Your Car, Our Driver';
export const APP_SUBTITLE = 'Your Car, Our Professional Driver';
export const APP_DESCRIPTION = 'Safe · Verified · On-Time';

/** Maximum vehicles a customer can register */
export const MAX_USER_CARS = 5;
/** Maximum vehicles a driver can register as experience */
export const MAX_DRIVER_CARS = 10;

// Service Types
export const SERVICE_TYPES = [
  {
    id: 'point-to-point',
    title: 'Point to Point',
    description: 'Pick & drop at same location',
    icon: 'MapPin',
    color: '#3498DB',
  },
  {
    id: 'hourly',
    title: 'Hourly Booking',
    description: 'Book driver by the hour',
    icon: 'Clock',
    color: '#2ECC71',
  },
  {
    id: 'full-day',
    title: 'Full Day',
    description: 'Driver for a full day',
    icon: 'Sun',
    color: '#F39C12',
  },
  {
    id: 'outstation',
    title: 'Round trip',
    description: 'Round trips with driver',
    icon: 'Navigation',
    color: '#9B59B6',
  },
];

// Car Experience Types (driver can select up to 5)
export const CAR_EXPERIENCE_TYPES = [
  { id: 'hatchback', label: 'Hatchback', color: '#3498DB' },
  { id: 'sedan', label: 'Sedan', color: '#2ECC71' },
  { id: 'suv', label: 'SUV', color: '#E67E22' },
  { id: 'premium', label: 'Premium', color: '#9B59B6' },
  { id: 'ev', label: 'EV / Electric', color: '#1ABC9C' },
  { id: 'luxury', label: 'Luxury', color: '#E74C3C' },
  { id: 'muv', label: 'MUV / MPV', color: '#F39C12' },
  { id: 'pickup', label: 'Pickup Truck', color: '#8E44AD' },
];

// Fuel Types
export const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'];

// Transmission Types
export const TRANSMISSION_TYPES = ['Manual', 'Automatic'];

// Payment Methods
export const PAYMENT_METHODS = [
  { id: 'upi', label: 'UPI', icon: 'Smartphone' },
  { id: 'card', label: 'Card', icon: 'CreditCard' },
  { id: 'wallet', label: 'Wallet', icon: 'Wallet' },
  { id: 'sparedriver-wallet', label: 'SpareDriver Wallet', icon: 'Banknote' },
];

// Mock Data
export const MOCK_DRIVERS = [
  {
    id: '1',
    name: 'Ravi Kumar',
    rating: 4.8,
    trips: 1251,
    distance: '1.2 km',
    eta: '4 min',
    phone: '+91 98765 43210',
    vehicleType: 'car',
    avatar: null,
  },
  {
    id: '2',
    name: 'Abhishek Sharma',
    rating: 4.6,
    trips: 890,
    distance: '1.5 km',
    eta: '6 min',
    phone: '+91 98765 43211',
    vehicleType: 'bike',
    avatar: null,
  },
  {
    id: '3',
    name: 'Suresh Yadav',
    rating: 4.9,
    trips: 2100,
    distance: '2.1 km',
    eta: '8 min',
    phone: '+91 98765 43212',
    vehicleType: 'car',
    avatar: null,
  },
];

export const MOCK_CARS = [
  {
    id: '1',
    brand: 'Maruti Suzuki',
    model: 'Swift Dzire',
    number: 'MP09 AB 1234',
    fuelType: 'Petrol',
    transmission: 'Manual',
  },
  {
    id: '2',
    brand: 'Hyundai',
    model: 'i20 Asta',
    number: 'MP09 CD 5678',
    fuelType: 'Diesel',
    transmission: 'Manual',
  },
  {
    id: '3',
    brand: 'Honda',
    model: 'City',
    number: 'MP09 EF 9012',
    fuelType: 'Diesel',
    transmission: 'Automatic',
  },
];

export const MOCK_BOOKINGS = [
  {
    id: 'BK001',
    serviceType: 'Point to Point',
    pickup: 'Vijay Nagar, Indore',
    drop: 'Palasia, Indore',
    date: '16 May 2026, 10:30 AM',
    duration: '2 Hours',
    distance: '12.4 km',
    fare: 449,
    status: 'completed',
    driverName: 'Ravi Kumar',
    driverRating: 4.8,
  },
  {
    id: 'BK002',
    serviceType: 'Hourly Booking',
    pickup: 'Bhanwarkua, Indore',
    drop: null,
    date: '15 May 2026, 02:00 PM',
    duration: '3 Hours',
    distance: '8.6 km',
    fare: 650,
    status: 'completed',
    driverName: 'Suresh Yadav',
    driverRating: 4.9,
  },
  {
    id: 'BK003',
    serviceType: 'Full Day',
    pickup: 'Sapna Sangeeta, Indore',
    drop: null,
    date: '18 May 2026, 08:00 AM',
    duration: 'Full Day',
    distance: null,
    fare: 1899,
    status: 'upcoming',
    driverName: null,
    driverRating: null,
  },
];

export const MOCK_DRIVER_TRIPS = [
  {
    id: 'DT001',
    pickup: 'Vijay Nagar, Indore',
    drop: 'Palasia, Indore',
    date: '10:30 AM',
    fullDate: 'Today',
    duration: '2 Hours',
    distance: '12.4 km',
    fare: 250,
    status: 'completed',
  },
  {
    id: 'DT002',
    pickup: 'Palasia, Indore',
    drop: 'Bhanwarkua, Indore',
    date: '05:15 PM',
    fullDate: 'Yesterday',
    duration: '1.5 Hours',
    distance: '8.6 km',
    fare: 190,
    status: 'completed',
  },
  {
    id: 'DT003',
    pickup: 'Bhanwarkua, Indore',
    drop: null,
    date: '06:30 PM',
    fullDate: 'Yesterday',
    duration: '1 Hour',
    distance: '5.2 km',
    fare: 120,
    status: 'completed',
  },
];

export const CAR_BRANDS = [
  'Maruti Suzuki', 'Hyundai', 'Tata', 'Honda', 'Toyota',
  'Kia', 'Mahindra', 'Volkswagen', 'Skoda', 'MG',
  'BMW', 'Mercedes-Benz', 'Audi', 'Renault', 'Nissan',
];

// ============================================
// ADMIN MOCK DATA
// ============================================

export const ADMIN_MOCK_DRIVERS = [
  {
    id: 'D001',
    name: 'Ravi Kumar',
    phone: '9876543210',
    approvalStatus: 'approved',
    onboardingStep: 5,
    isOnline: true,
    isOnTrip: false,
    rating: 4.8,
    todaySummary: { trips: 3, earnings: 850 },
    carTypeExperience: ['sedan', 'hatchback'],
    createdAt: '2026-05-10T10:00:00Z',
  },
  {
    id: 'D002',
    name: 'Abhishek Sharma',
    phone: '9876543211',
    approvalStatus: 'pending',
    onboardingStep: 4, // Finished safety, pending approval
    isOnline: false,
    isOnTrip: false,
    rating: 0,
    todaySummary: { trips: 0, earnings: 0 },
    carTypeExperience: ['suv', 'sedan'],
    createdAt: '2026-05-12T14:30:00Z',
  },
  {
    id: 'D003',
    name: 'Suresh Yadav',
    phone: '9876543212',
    approvalStatus: 'approved',
    onboardingStep: 5,
    isOnline: true,
    isOnTrip: true,
    rating: 4.9,
    todaySummary: { trips: 1, earnings: 450 },
    carTypeExperience: ['premium', 'luxury', 'sedan'],
    createdAt: '2026-05-01T09:15:00Z',
  },
  {
    id: 'D004',
    name: 'Vikram Singh',
    phone: '9876543213',
    approvalStatus: 'rejected',
    onboardingStep: 5,
    isOnline: false,
    isOnTrip: false,
    rating: 0,
    todaySummary: { trips: 0, earnings: 0 },
    carTypeExperience: ['hatchback'],
    createdAt: '2026-05-11T11:45:00Z',
  },
];

export const ADMIN_MOCK_USERS = [
  {
    id: 'U001',
    name: 'Amit Patel',
    phone: '9988776655',
    email: 'amit@example.com',
    carsCount: 2,
    totalBookings: 15,
    joinedAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'U002',
    name: 'Neha Gupta',
    phone: '9988776656',
    email: 'neha@example.com',
    carsCount: 1,
    totalBookings: 4,
    joinedAt: '2026-03-22T10:30:00Z',
  },
  {
    id: 'U003',
    name: 'Rahul Desai',
    phone: '9988776657',
    email: 'rahul@example.com',
    carsCount: 0,
    totalBookings: 0,
    joinedAt: '2026-05-13T09:00:00Z',
  },
];

export const ADMIN_MOCK_BOOKINGS = [
  {
    id: 'BK1001',
    user: 'Amit Patel',
    driver: 'Ravi Kumar',
    serviceType: 'Point to Point',
    status: 'completed',
    fare: 450,
    date: '2026-05-13T10:30:00Z',
  },
  {
    id: 'BK1002',
    user: 'Neha Gupta',
    driver: 'Suresh Yadav',
    serviceType: 'Hourly Booking',
    status: 'in_progress',
    fare: 600,
    date: '2026-05-13T14:00:00Z',
  },
  {
    id: 'BK1003',
    user: 'Amit Patel',
    driver: null,
    serviceType: 'Round trip',
    status: 'pending',
    fare: 2500,
    date: '2026-05-14T08:00:00Z',
  },
];
