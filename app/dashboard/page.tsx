'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CSVImporter } from '@/components/csv-importer'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Toast } from '@/components/ui/toast'
import { Upload, ArrowRight, Calendar, MoreVertical, Pencil, Trash2, Check, X, RefreshCw, FolderOpen, Database } from 'lucide-react'
import { Board } from '@/lib/types'
import { Loader } from '@/components/ui/loader'
import { Skeleton } from '@/components/ui/skeleton'

interface BoardWithCount extends Board {
  leadCount: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [boards, setBoards] = useState<BoardWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant?: 'default' | 'destructive' } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null)

  const fetchBoards = async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      
      // Add cache-busting query parameter
      const response = await fetch(`/api/boards?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch boards: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      const boardsList = data.boards || []
      
      // Force state update by creating a new array reference
      // This ensures React detects the change even if the array contents are similar
      setBoards(() => [...boardsList])
    } catch (error) {
      console.error('Error fetching boards:', error)
      setToast({
        message: 'Failed to load projects. Please refresh the page.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchBoards()
  }, [])

  const handleImportComplete = () => {
    // Refresh boards list after import (without showing full loading state)
    fetchBoards(false)
  }

  const handleRenameStart = (board: BoardWithCount) => {
    setEditingBoardId(board.id)
    setEditingName(board.name)
  }

  const handleRenameCancel = () => {
    setEditingBoardId(null)
    setEditingName('')
  }

  const handleRenameSave = async (boardId: string) => {
    if (!editingName.trim()) {
      setToast({ message: 'Board name cannot be empty', variant: 'destructive' })
      return
    }

    // Don't allow saving if already renaming
    if (renamingBoardId === boardId) {
      return
    }

    try {
      setRenamingBoardId(boardId)

      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        let errorMessage = 'Failed to rename board'
        
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json()
          errorMessage = error.message || 'Failed to rename board'
        } else {
          const text = await response.text()
          console.error('Non-JSON error response:', text.substring(0, 200))
          errorMessage = `Server error (${response.status}): ${response.statusText}`
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()

      // Optimistically update the board name in the list immediately
      setBoards(prevBoards =>
        prevBoards.map(board =>
          board.id === boardId ? { ...board, name: editingName.trim() } : board
        )
      )

      // Exit edit mode
      setEditingBoardId(null)
      setEditingName('')
      
      // Show success message
      setToast({ message: 'Board renamed successfully' })
      
      // Refresh to get updated data from server (wait for it to complete)
      await fetchBoards(false)
      
      // Clear loading state after refresh completes
      setRenamingBoardId(null)
    } catch (error) {
      console.error('Error renaming board:', error)
      setRenamingBoardId(null)
      setToast({
        message: error instanceof Error ? error.message : 'Failed to rename board',
        variant: 'destructive',
      })
      // Refresh to restore accurate state
      fetchBoards(false)
    }
  }

  const handleDelete = async (boardId: string) => {
    try {
      setDeletingBoardId(boardId)

      // Optimistically remove the board from the list immediately
      setBoards(prevBoards => {
        return prevBoards.filter(board => board.id !== boardId)
      })

      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        // If it's a 404, the board was already deleted - that's fine, just refresh
        if (response.status === 404) {
          setDeleteDialogOpen(null)
          setDeletingBoardId(null)
          await fetchBoards(false)
          setToast({ message: 'Board deleted successfully' })
          return
        }
        
        const contentType = response.headers.get('content-type')
        let errorMessage = 'Failed to delete board'
        
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json()
          errorMessage = error.message || 'Failed to delete board'
        } else {
          const text = await response.text()
          console.error('Non-JSON error response:', text.substring(0, 200))
          errorMessage = `Server error (${response.status}): ${response.statusText}`
        }
        
        // Revert optimistic update on error (except 404) by refreshing from server
        await fetchBoards(false)
        
        throw new Error(errorMessage)
      }

      const data = await response.json()

      // Close dialog first
      setDeleteDialogOpen(null)
      
      // Show success message
      setToast({ message: 'Board deleted successfully' })
      
      // Refresh to ensure consistency and get updated list from server
      // This will overwrite the optimistic update with fresh data
      await fetchBoards(false)
      
      // Double-check: Ensure the deleted board is not in the list
      setBoards(prevBoards => {
        return prevBoards.filter(board => board.id !== boardId)
      })
      
      // Clear loading state after refresh completes
      setDeletingBoardId(null)
    } catch (error) {
      console.error('Error deleting board:', error)
      setDeletingBoardId(null)
      
      // Refresh to restore accurate state
      await fetchBoards(false)
      
      setToast({
        message: error instanceof Error ? error.message : 'Failed to delete board',
        variant: 'destructive',
      })
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Loading skeleton
  const BoardCardSkeleton = () => (
    <div className="border border-border/60 rounded-xl p-6 bg-card">
      <div className="flex items-start justify-between mb-5">
        <Skeleton className="h-6 w-3/4 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="space-y-2.5 mb-5">
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Chatpire Research</h1>
              <p className="text-sm text-muted-foreground mt-1">Manage your data projects</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => fetchBoards(false)}
                variant="outline"
                size="default"
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => setIsImportModalOpen(true)} size="default" className="gap-2">
                <Upload className="h-4 w-4" />
                Import CSV & Create Project
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 relative">
        {isRefreshing && (
          <div className="absolute top-2 right-6 z-10 flex items-center gap-2 text-sm text-muted-foreground bg-background/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-border/60 shadow-sm">
            <Loader size="sm" />
            <span>Refreshing...</span>
          </div>
        )}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <BoardCardSkeleton key={i} />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="text-center space-y-5 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-2">
                <FolderOpen className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">No projects yet</h2>
              <p className="text-muted-foreground leading-relaxed">
                Get started by importing your first CSV file. Each import creates a new project board.
              </p>
              <Button onClick={() => setIsImportModalOpen(true)} size="lg" className="gap-2 mt-2">
                <Upload className="h-4 w-4" />
                Import Your First CSV
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {boards.map((board, index) => (
              <div
                key={board.id}
                className={`group border border-border/60 rounded-xl p-6 bg-card hover:shadow-lg hover:border-border transition-all duration-200 relative overflow-visible animate-fade-in-up ${
                  deletingBoardId === board.id || renamingBoardId === board.id ? 'opacity-50 pointer-events-none' : ''
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Loading overlay for rename */}
                {renamingBoardId === board.id && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-30">
                    <div className="flex flex-col items-center gap-2">
                      <Loader size="md" />
                      <span className="text-sm text-muted-foreground">Renaming...</span>
                    </div>
                  </div>
                )}
                {/* Dropdown Menu */}
                <div className="absolute top-4 right-4 z-20">
                  <DropdownMenu
                    trigger={
                      <button 
                        className="p-1.5 rounded-lg bg-background hover:bg-muted transition-all cursor-pointer border border-border/60 shadow-sm opacity-0 group-hover:opacity-100"
                        aria-label="Board options"
                        type="button"
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                    }
                  >
                    <DropdownMenuItem onClick={() => handleRenameStart(board)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteDialogOpen(board.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenu>
                </div>

                {/* Board Name - Editable */}
                <div className="flex items-start justify-between mb-4 pr-10">
                  {editingBoardId === board.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && renamingBoardId !== board.id) {
                            handleRenameSave(board.id)
                          } else if (e.key === 'Escape' && renamingBoardId !== board.id) {
                            handleRenameCancel()
                          }
                        }}
                        className="flex-1 h-9 text-sm"
                        autoFocus
                        disabled={renamingBoardId === board.id}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRenameSave(board.id)}
                        className="h-9 w-9 p-0"
                        disabled={renamingBoardId === board.id}
                      >
                        {renamingBoardId === board.id ? (
                          <Loader size="sm" className="h-4 w-4" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRenameCancel}
                        className="h-9 w-9 p-0"
                        disabled={renamingBoardId === board.id}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <h3 className="text-lg font-semibold tracking-tight line-clamp-2">{board.name}</h3>
                  )}
                </div>

                <div className="space-y-2 mb-5">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 mr-2" />
                    {formatDate(board.created_at)}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Database className="h-3.5 w-3.5 mr-2" />
                    {board.leadCount.toLocaleString()} {board.leadCount === 1 ? 'row' : 'rows'}
                  </div>
                </div>

                <Link href={`/dashboard/board/${board.id}`}>
                  <Button className="w-full gap-2" variant="outline">
                    Open Project
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <CSVImporter
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onImportComplete={handleImportComplete}
      />

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <AlertDialog
          open={!!deleteDialogOpen}
          onOpenChange={(open) => !open && setDeleteDialogOpen(null)}
          title="Delete Project"
          description="Are you sure? This will delete all leads in this project. This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => deleteDialogOpen && handleDelete(deleteDialogOpen)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
