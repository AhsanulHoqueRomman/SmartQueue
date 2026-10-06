import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useBookingContact() {
  const { user } = useAuth();
  const [editedName, setName] = useState();
  const [editedPhone, setPhone] = useState();
  const name = editedName ?? (`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || '');
  const phone = editedPhone ?? (user?.phone_number || '');
  return {
    name, phone, setName, setPhone,
    valid: Boolean(name.trim()) && /^(?:01[3-9][0-9]{8}|\+8801[3-9][0-9]{8})$/.test(phone.trim()),
    payload: { contact_name: name.trim(), contact_phone: phone.trim() },
  };
}
