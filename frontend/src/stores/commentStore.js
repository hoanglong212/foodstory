import { defineStore } from 'pinia'
import { useRecipeStore } from './recipeStore'

function normalizeComment(comment) {
  return {
    ...comment,
    user_id: comment.user_id ?? comment.userId,
    recipe_id: comment.recipe_id ?? comment.recipeId,
    created_at: comment.created_at ?? comment.createdAt,
    updated_at: comment.updated_at ?? comment.updatedAt ?? comment.createdAt,
  }
}

export const useCommentStore = defineStore('comments', {
  state: () => ({
    comments: [],
    deletedComments: [],
  }),
  actions: {
    addCommentFromSocket(comment) {
      const normalizedComment = normalizeComment(comment)
      this.deletedComments = this.deletedComments.filter(
        (item) => item.commentId !== normalizedComment.id,
      )
      if (this.comments.find((item) => item.id === normalizedComment.id)) {
        return
      }

      this.comments.push(normalizedComment)
      useRecipeStore().addCommentFromSocket(normalizedComment)
    },
    updateCommentFromSocket(comment) {
      const normalizedComment = normalizeComment(comment)
      const existingComment = this.comments.find((item) => item.id === normalizedComment.id)
      this.comments = existingComment
        ? this.comments.map((item) =>
            item.id === normalizedComment.id ? { ...item, ...normalizedComment } : item,
          )
        : [...this.comments, normalizedComment]
      useRecipeStore().updateCommentFromSocket(normalizedComment)
    },
    deleteCommentFromSocket({ recipeId, commentId }) {
      this.comments = this.comments.filter((comment) => comment.id !== commentId)
      if (!this.deletedComments.find((item) => item.commentId === commentId)) {
        this.deletedComments.push({
          recipeId: Number(recipeId),
          commentId,
        })
      }
      useRecipeStore().deleteCommentFromSocket({ recipeId, commentId })
    },
  },
})
