import React, { useState } from 'react'
import { NativeStackHeaderProps } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import auth from '@react-native-firebase/auth'
import firestore from '@react-native-firebase/firestore'
import { ReactNativeFirebase } from '@react-native-firebase/app'

import { IDialog } from '~/atomic/molecules'
import { IRegisterFormInputs } from '~/atomic/organisms'
import { RegisterTemplate } from '~/atomic/templates'
import { useAppDispatch, userProfileActions } from '~/store'
import { logger } from '~/utils'
import { collectionUsers, collectionDependents } from '~/services/firebase'
import { useCreateDefaultNotifications } from '~/hooks'

interface IRegister extends NativeStackHeaderProps {
  route: RouteProp<{
    paramns: {
      isSocialRegister: boolean
    }
  }>
}

export const Register: React.FC<IRegister> = ({ route, navigation }) => {
  const TAG = 'Register'
  const dispatch = useAppDispatch()
  const createNotifications = useCreateDefaultNotifications()

  const [dialog, setDialog] = useState<IDialog>({ visible: false })
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const createInAuth = async (email: string, password: string) => {
    try {
      return await auth().createUserWithEmailAndPassword(email, password)
    } catch (_error) {
      const error = _error as ReactNativeFirebase.NativeFirebaseError
      const errors: {[key: string]: string} = {
        'auth/weak-password': 'Sua senha é não atende aos criterios de segurançaa, ela deve possuir no minimo 6 caracteres',
        'auth/email-already-in-use': 'O email ja esta em uso',
        'auth/invalid-email': 'O email informado não é valido',
        default: 'Houve um erro para finalizar seu cadastro'
      }
      const errorContent = errors?.[error.code] ?? errors.default
      logger(TAG, 'createInAuth error', error.message)
      setDialog({
        visible: true,
        title: 'Erro!',
        content: errorContent
      })

      throw error
    }
  }

  const updateDisplayName = async (displayName: string) => {
    await auth().currentUser?.updateProfile({ displayName })
    dispatch(userProfileActions.setName(displayName))
  }

  const createInFirestore = async (form: IRegisterFormInputs, uid: string, retry = 0): Promise<string> => {
    try {
      await collectionUsers.doc(uid).set({
        name: form.name,
        uid
      })
      const ref = collectionUsers.doc(uid)
      const refDependent = await collectionDependents.add({
        birthDate: firestore.Timestamp.fromDate(new Date(form.birthDate)),
        name: form.name,
        userUid: ref
      })
      return refDependent.id
    } catch (_error) {
      const error = _error as ReactNativeFirebase.NativeFirebaseError
      logger(TAG, 'createInFirestore error', error.message)
      if (retry < 3) return createInFirestore(form, uid, retry + 1)
      throw error
    }
  }

  const handleSubmit = async (form: IRegisterFormInputs) => {
    try {
      logger(TAG, 'handleSubmit', form)
      if (isLoading) return
      setIsLoading(true)
      dispatch(userProfileActions.setCreatingUser(true))
      const credentails = await createInAuth(form.email, form.password)
      await updateDisplayName(form.name)
      const id = await createInFirestore(form, credentails.user.uid)
      await createNotifications(new Date(form.birthDate), id, form.name)
      setDialog({
        visible: true,
        title: 'Sucesso',
        content: 'Cadastro finalizado com sucesso',
        onPressOk: navigation.popToTop
      })
    } finally {
      setIsLoading(false)
      dispatch(userProfileActions.setCreatingUser(false))
    }
  }

  return (
    <RegisterTemplate
      dialog={{
        ...dialog,
        onClose: () => setDialog({ visible: false })
      }}
      form={{
        onSubmit: handleSubmit,
        isSocialRegister: route.params?.isSocialRegister,
        isLoading
      }}
    />
  )
}
