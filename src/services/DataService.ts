import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { Monitor, MonitorUrl, SiteKey } from '@/types/monitor';

type DbMonitor = Tables<'monitors'>;
type DbListing = Tables<'listings'>;
type DbNote = Tables<'notes'>;

export class DataService {
  // ========== MONITORS ==========

  static async getMonitors(userId: string): Promise<Monitor[]> {
    const { data, error } = await supabase
      .from('monitors')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching monitors:', error);
      return [];
    }

    return (data || []).map(this.dbMonitorToMonitor);
  }

  static async createMonitor(
    userId: string,
    monitor: Omit<Monitor, 'id' | 'createdAt'>
  ): Promise<Monitor | null> {
    const insert: TablesInsert<'monitors'> = {
      user_id: userId,
      name: monitor.name,
      urls: monitor.urls as unknown as Record<string, unknown>[],
      refresh_interval_hours: monitor.refreshIntervalHours ?? 24,
      last_checked_at: monitor.lastCheckedAt || null,
    };

    const { data, error } = await supabase
      .from('monitors')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('Error creating monitor:', error);
      return null;
    }

    return this.dbMonitorToMonitor(data);
  }

  static async updateMonitor(
    monitorId: string,
    userId: string,
    updates: Partial<Monitor>
  ): Promise<boolean> {
    const update: TablesUpdate<'monitors'> = {};

    if (updates.name !== undefined) update.name = updates.name;
    if (updates.urls !== undefined) update.urls = updates.urls as unknown as Record<string, unknown>[];
    if (updates.refreshIntervalHours !== undefined) update.refresh_interval_hours = updates.refreshIntervalHours;
    if (updates.lastCheckedAt !== undefined) update.last_checked_at = updates.lastCheckedAt;

    const { error } = await supabase
      .from('monitors')
      .update(update)
      .eq('id', monitorId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating monitor:', error);
      return false;
    }
    return true;
  }

  static async deleteMonitor(monitorId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('monitors')
      .delete()
      .eq('id', monitorId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting monitor:', error);
      return false;
    }
    return true;
  }

  // ========== LISTINGS (HISTORY) ==========

  static async getListings(monitorId: string, userId: string): Promise<DbListing[]> {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('monitor_id', monitorId)
      .eq('user_id', userId)
      .order('first_seen_at', { ascending: false });

    if (error) {
      console.error('Error fetching listings:', error);
      return [];
    }
    return data || [];
  }

  static async upsertListing(
    monitorId: string,
    userId: string,
    listing: {
      url: string;
      site: SiteKey;
      title?: string;
      price?: string;
      mileage?: string;
      location?: string;
      firstSeenAt: string;
      lastSeenAt: string;
      removedAt?: string;
    }
  ): Promise<DbListing | null> {
    const insert: TablesInsert<'listings'> = {
      monitor_id: monitorId,
      user_id: userId,
      url: listing.url,
      site: listing.site,
      title: listing.title || null,
      price: listing.price || null,
      mileage: listing.mileage || null,
      location: listing.location || null,
      first_seen_at: listing.firstSeenAt,
      last_seen_at: listing.lastSeenAt,
      removed_at: listing.removedAt || null,
    };

    const { data, error } = await supabase
      .from('listings')
      .upsert(insert, {
        onConflict: 'user_id,url,site',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting listing:', error);
      return null;
    }
    return data;
  }

  static async updateListing(
    listingId: string,
    userId: string,
    updates: {
      lastSeenAt?: string;
      removedAt?: string;
      title?: string;
      price?: string;
      mileage?: string;
      location?: string;
      note?: string;
    }
  ): Promise<boolean> {
    const update: TablesUpdate<'listings'> = {};

    if (updates.lastSeenAt !== undefined) update.last_seen_at = updates.lastSeenAt;
    if (updates.removedAt !== undefined) update.removed_at = updates.removedAt;
    if (updates.title !== undefined) update.title = updates.title;
    if (updates.price !== undefined) update.price = updates.price;
    if (updates.mileage !== undefined) update.mileage = updates.mileage;
    if (updates.location !== undefined) update.location = updates.location;
    if (updates.note !== undefined) update.note = updates.note;

    const { error } = await supabase
      .from('listings')
      .update(update)
      .eq('id', listingId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating listing:', error);
      return false;
    }
    return true;
  }

  static async deleteListingsForMonitor(monitorId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('monitor_id', monitorId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting listings:', error);
      return false;
    }
    return true;
  }

  // ========== NOTES ==========

  static async setNote(listingId: string, userId: string, note: string): Promise<boolean> {
    const { error } = await supabase
      .from('notes')
      .upsert(
        {
          listing_id: listingId,
          user_id: userId,
          note,
        },
        { onConflict: 'listing_id' }
      );

    if (error) {
      console.error('Error setting note:', error);
      return false;
    }
    return true;
  }

  static async deleteNote(listingId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('listing_id', listingId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting note:', error);
      return false;
    }
    return true;
  }

  // ========== HELPERS ==========

  private static dbMonitorToMonitor(db: DbMonitor): Monitor {
    return {
      id: db.id,
      name: db.name,
      urls: (db.urls as unknown as MonitorUrl[]) || [],
      refreshIntervalHours: db.refresh_interval_hours,
      lastCheckedAt: db.last_checked_at || undefined,
      createdAt: db.created_at,
    };
  }
}
