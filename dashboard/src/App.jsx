import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CallDetail from './pages/CallDetail';
import Calls from './pages/Calls';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Workflows from './pages/Workflows';
import Reports from './pages/Reports';
import Simulate from './pages/Simulate';
import Templates from './pages/Templates';
import Customers from './pages/Customers';
import Campaigns from './pages/Campaigns';
import ApiConfig from './pages/ApiConfig';
import CrmIntegration from './pages/CrmIntegration';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/calls" element={<ProtectedRoute><Calls /></ProtectedRoute>} />
        <Route path="/calls/:callId" element={<ProtectedRoute><CallDetail /></ProtectedRoute>} />
        <Route path="/workflows" element={<ProtectedRoute><Workflows /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
        <Route path="/simulate" element={<ProtectedRoute><Simulate /></ProtectedRoute>} />
        <Route path="/api-config" element={<ProtectedRoute><ApiConfig /></ProtectedRoute>} />
        <Route path="/crm" element={<ProtectedRoute><CrmIntegration /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
