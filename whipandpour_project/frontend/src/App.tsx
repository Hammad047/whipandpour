import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { WishlistProvider } from "./contexts/WishlistContext";
import { AdminProvider } from "./contexts/AdminContext";
import Navbar from "./components/Navbar";
import CartDrawerComponent from "./components/CartDrawerComponent";

// Public Pages
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import Wishlist from "./pages/Wishlist";
import Account from "./pages/Account";
import About from "./pages/About";
import Contact from "./pages/Contact";

// Admin Pages
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminProducts from "./pages/AdminProducts";
import AdminOrders from "./pages/AdminOrders";
import AdminCustomers from "./pages/AdminCustomers";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminPromos from "./pages/AdminPromos";
import AdminReviews from "./pages/AdminReviews";
import AdminInventory from "./pages/AdminInventory";
import AdminPayments from "./pages/AdminPayments";

function Router() {
  const [location] = useLocation();
  const isAdminPage = location.startsWith('/admin');

  return (
    <>
      {/* Navbar shown on all non-admin pages */}
      {!isAdminPage && <Navbar />}

      <Switch>
        {/* Public Routes */}
        <Route path="/" component={Home} />
        <Route path="/shop" component={Shop} />
        <Route path="/product/:slug" component={ProductDetail} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/order/success" component={OrderSuccess} />
        <Route path="/wishlist" component={Wishlist} />
        <Route path="/account" component={Account} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />

        {/* Admin Routes */}
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/analytics" component={AdminAnalytics} />
        <Route path="/admin/promos" component={AdminPromos} />
        <Route path="/admin/reviews" component={AdminReviews} />
        <Route path="/admin/inventory" component={AdminInventory} />
        <Route path="/admin/payments" component={AdminPayments} />

        {/* 404 */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AdminProvider>
          <CartProvider>
            <WishlistProvider>
              <TooltipProvider>
                <Toaster />
                <Router />
                <CartDrawerComponent />
              </TooltipProvider>
            </WishlistProvider>
          </CartProvider>
        </AdminProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
