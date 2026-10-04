'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface ThumbnailUploaderProps {
  onUploaded: (url: string) => void;
  currentUrl?: string | null;
}

export function ThumbnailUploader({ onUploaded, currentUrl }: ThumbnailUploaderProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Thumbnail must be under 5MB');
      return;
    }

    setUploading(true);

    const filePath = `${user.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(filePath);

    setPreview(urlData.publicUrl);
    onUploaded(urlData.publicUrl);
    setUploading(false);
    toast.success('Thumbnail uploaded');
  }, [user, onUploaded]);

  const remove = () => {
    setPreview(null);
    onUploaded('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {preview ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-200">
          <img src={preview} alt="Thumbnail preview" className="w-full h-40 object-cover" />
          <button
            onClick={remove}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center gap-2 w-full h-40 rounded-xl border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <ImagePlus className="h-5 w-5 text-slate-500" />
          </div>
          <span className="text-sm text-slate-500">
            {uploading ? 'Uploading...' : 'Upload thumbnail (optional)'}
          </span>
        </button>
      )}
    </div>
  );
}
