'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { UploadCloud, X, FileVideo, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface VideoUploaderProps {
  onUploaded: (data: {
    videoId: string;
    videoUrl: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }) => void;
}

export function VideoUploader({ onUploaded }: VideoUploaderProps) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;

    setError(null);
    setDone(false);
    setProgress(0);
    setFileName(file.name);

    if (!file.type.startsWith('video/')) {
      setError('Please select a video file');
      return;
    }

    const maxSize = 4 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 4GB.');
      return;
    }

    setUploading(true);

    const filePath = `${user.id}/${Date.now()}-${file.name}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    setProgress(70);

    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    const { data: videoRow, error: dbError } = await supabase
      .from('videos')
      .insert({
        title: file.name.replace(/\.[^/.]+$/, ''),
        video_url: urlData.publicUrl,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        status: 'ready',
      })
      .select('id')
      .single();

    if (dbError) {
      setError(dbError.message);
      setUploading(false);
      return;
    }

    setProgress(100);
    setUploading(false);
    setDone(true);

    onUploaded({
      videoId: videoRow.id,
      videoUrl: urlData.publicUrl,
      filePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });

    toast.success('Video uploaded successfully');
  }, [user, onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const reset = () => {
    setDone(false);
    setFileName('');
    setProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleChange}
      />

      {done ? (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-green-200 bg-green-50">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-900 truncate">{fileName}</p>
            <p className="text-xs text-green-600">Upload complete</p>
          </div>
          <Button size="sm" variant="ghost" onClick={reset}>
            Replace
          </Button>
        </div>
      ) : uploading ? (
        <div className="p-6 rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 mb-3">
            <FileVideo className="h-5 w-5 text-slate-600 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-700 truncate">{fileName}</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-slate-500 mt-2">{progress < 70 ? 'Uploading...' : 'Processing...'}</p>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? 'border-slate-400 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <UploadCloud className="h-6 w-6 text-slate-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-slate-500 mt-1">
              MP4, MOV, AVI, WebM — up to 4GB
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
