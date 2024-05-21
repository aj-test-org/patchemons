import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Flex, Title, Button, IconAndText, Subheader, Paragraph, useModal, Caption } from '@codacy/ui-components'
import { ReactComponent as FilterIcon } from 'ionicons/dist/ionicons/svg/funnel-outline.svg'

import Paywall from '../Paywall'
import PullRequestWidget from './PullRequestsWidget'
import LastUpdatedWidget from './LastUpdatedWidget'
import OverallQuality from './OverallQuality'

import { Page, EmptyState, SupportLink, Link, routes, useNavigation, Loader } from 'components'
import {
  FollowAnnoncementBanner,
  FOLLOW_BANNER_KEY,
  FollowAnnouncementModal,
  ManageRepositoriesModal,
  SuggestedPeoplePanel,
  OrganizationOwnerContent,
  FOLLOW_ANNOUNCEMENT_MODAL_KEY,
  AppPermissionsBanner,
} from '../components'

import { OrganizationParams } from 'components/router/routes/organization'
import { ReactComponent as AddIcon } from 'ionicons/dist/ionicons/svg/add-outline.svg'
import { Route, useParams } from 'react-router-dom'
import { RepositoryWithAnalysis } from '@codacy/api-typescript/lib/models'
import { glossary, useLocalStorage } from 'common'
import { QualityFactorsType } from './OverallQuality/types'
import { ButtonProps } from '@codacy/ui-components/lib/Button/types'
import { DrillDownRepositoriesCard } from './DrillDownRepositoriesCard'
import { useOrganizationMemberContext } from 'context/OrganizationsContext'
import { useAnalytics } from 'thirdParty/analytics'
import { RepositoriesDropdown } from 'components/data'
import { REPOSITORIES_ANALYSIS_QUERY_KEY, useRepositoriesWithAnalysis } from 'data/useRepositoriesWithAnalysis'
import { docsLink } from 'common/docsLink'
import { BadGatewayApiError } from '@codacy/api-typescript'
import AppConfiguration from 'configuration/AppConfiguration'
import { useOrganizationAppPermissions } from 'data/useOrganizationAppPermissions'
import { OnboardingProgressBar } from 'components/common/OnboardingProgressBar'
import { useReleaseTogglesContext } from 'context/ReleaseTogglesContext'
import { useOnboardingProgress } from 'data/useOnboardingProgress'
import { useStableRouteMatch } from 'common/useStableRouteMatch'
import { useQueryClient } from '@tanstack/react-query'

const ManageRepositoriesButton: React.FCC<Pick<ButtonProps, 'onClick'>> = ({ onClick }) => {
  return (
    <Button btnType="primary" className="repositories-add-navigate" onClick={onClick}>
      <IconAndText icon={AddIcon} iconProps={{ scale: 1.25 }}>
        Manage repositories
      </IconAndText>
    </Button>
  )
}

const TeamDashboard: React.FCC = () => {
  const [openedOnLoad, setOpenedOnLoad] = useState<boolean>(false)
  const { organization, billing, paywall, membership } = useOrganizationMemberContext()
  const match = useStableRouteMatch(routes.organization.dashboard.add.path)
  const manageRepositoryModalProps = useModal('manage-repository', !!match)
  const { trackTeamDashboard: track } = useAnalytics()
  const {
    flags: { tempOnboardingFlow },
  } = useReleaseTogglesContext()
  const { fetchData: fetchProgressData, data: progressData } = useOnboardingProgress()
  const params = useParams<OrganizationParams>()
  const { navigateTo } = useNavigation()
  const queryClient = useQueryClient()

  const [showSuggestions, setShowSuggestions] = useLocalStorage(
    `codacy.organization[${organization.provider}/${organization.name}].overview.peopleSuggestions`,
    true
  )

  const [selectedRepositoriesNames, setSelectedRepositoriesNames] = useLocalStorage<string[]>(
    `codacy.organization[${organization.provider}/${organization.name}].overview.selectedRepositories`,
    []
  )

  const { data, isLoading, isFetching, error, hasNextPage } = useRepositoriesWithAnalysis(
    organization,
    selectedRepositoriesNames
  )

  const allRepositories = useMemo(
    () =>
      data?.pages.flatMap((p) => {
        const repositories = p.data
        const result = repositories.slice(0, AppConfiguration.pagination.repositoriesLimit)

        return result
      }) || [],
    [data?.pages]
  )

  const repositoriesWithAnalysis = useMemo(() => allRepositories.filter((repo) => !!repo.lastAnalysedCommit), [
    allRepositories,
  ])

  const isFirstAnalysisLoading =
    repositoriesWithAnalysis.length === 0 && allRepositories.length !== repositoriesWithAnalysis.length

  const isEmpty = repositoriesWithAnalysis.length === 0 && !isLoading
  const isSinglePage = !hasNextPage && data?.pages.length === 1

  const badGatewayError = useMemo<BadGatewayApiError | undefined>(() => {
    if (error instanceof BadGatewayApiError) {
      return error
    }
  }, [error])

  const [hasSuggestions, setHasSuggestions] = useState(true)

  const [selectedBar, setSelectedBar] = useState<{ groupName: string; innerRepositories: RepositoryWithAnalysis[] }>()
  const [selectedFactor, setSelectedFactor] = useState<QualityFactorsType>('grade')

  const [followAnnouncementBanner, setFollowAnnouncementBanner] = useLocalStorage(
    FOLLOW_BANNER_KEY,
    membership !== 'admin'
  )

  const [followAnnouncementModal, setFollowAnnouncementModal] = useLocalStorage(
    FOLLOW_ANNOUNCEMENT_MODAL_KEY,
    membership !== 'admin'
  )

  const { data: appPermissions } = useOrganizationAppPermissions(
    params,
    organization.provider === 'gh' && !paywall?.organizationDashboard
  )

  const requiresAppPermissionsUpdate = appPermissions && !appPermissions.contentPermission

  const clear = useCallback(() => {
    queryClient.invalidateQueries([REPOSITORIES_ANALYSIS_QUERY_KEY])
  }, [queryClient])

  const handleManageRepositoriesClick = useCallback(() => {
    manageRepositoryModalProps.setVisible(true)

    navigateTo(routes.organization.dashboard.add, {
      provider: organization.provider,
      organization: organization.name,
    })
  }, [manageRepositoryModalProps, navigateTo, organization])

  const handleManageRepositoriesClose = useCallback(() => {
    clear()

    navigateTo(routes.organization.dashboard, {
      provider: organization.provider,
      organization: organization.name,
    })
  }, [navigateTo, organization, clear])

  const handleSuggestionsDismiss = useCallback(() => {
    track('Dismiss suggested people panel')
    setShowSuggestions(false)
  }, [setShowSuggestions])

  const handleSuggestionsLoad = useCallback((loading: boolean, showPanel: boolean) => {
    setHasSuggestions(loading || showPanel)
    if (showPanel) {
      track('Show suggested people panel')
    }
  }, [])

  const loading = isLoading || isFetching

  const displaySuggestions = showSuggestions && hasSuggestions && billing?.isPremium

  const handleBarSelect = useCallback(
    (groupName?: string, innerRepositories?: RepositoryWithAnalysis[]) => {
      if (groupName && innerRepositories) {
        setSelectedBar({ groupName, innerRepositories })
        track('Selected chart bar', {
          barName: groupName,
          factor: selectedFactor,
          innerRepositoriesCount: innerRepositories.length,
        })
      } else {
        setSelectedBar(undefined)
        track('Unselected chart bar')
      }
    },
    [track, selectedFactor]
  )

  const handleFactorChange = useCallback(
    (factor: QualityFactorsType) => {
      setSelectedFactor(factor)
      track('Selected quality factor', { factor })
    },
    [track]
  )

  const handleRepositoriesChange = useCallback(
    (val: string[]) => {
      setSelectedRepositoriesNames(val)
      track('Selected repositories', { repositoriesCount: val.length })
    },
    [setSelectedRepositoriesNames, track]
  )

  useEffect(() => {
    if (!openedOnLoad && isEmpty && !isFetching && !badGatewayError) {
      handleManageRepositoriesClick()
      setOpenedOnLoad(true)
    }
  }, [handleManageRepositoriesClick, isEmpty, isFetching, badGatewayError, openedOnLoad])

  useEffect(() => {
    !!match && manageRepositoryModalProps.setVisible(true)
  }, [match])

  useEffect(() => {
    tempOnboardingFlow && fetchProgressData(params)
  }, [repositoriesWithAnalysis, fetchProgressData, params, tempOnboardingFlow])

  useEffect(() => {
    let timeoutId: number
    if (isFirstAnalysisLoading) {
      timeoutId = window.setTimeout(clear, 30000)
    }
    return () => clearTimeout(timeoutId)
  }, [isFirstAnalysisLoading, clear, data])

  return (
    <Page title="Overview" category="organization.dashboard">
      {paywall?.organizationDashboard ? (
        <Paywall />
      ) : (
        <Flex p={6} flexDirection="column" flexGrow={1}>
          {/* Avoid showing banners in error empty state */}
          {!error &&
            (requiresAppPermissionsUpdate ? (
              <AppPermissionsBanner />
            ) : (
              followAnnouncementBanner && (
                <FollowAnnoncementBanner
                  onClick={manageRepositoryModalProps.show}
                  onClose={() => setFollowAnnouncementBanner(false)}
                />
              )
            ))}
          {/* Empty states */}
          {!isFetching &&
            error &&
            // Error empty states
            (badGatewayError ? (
              <EmptyState flexGrow={1} alignSelf="center" template="volcano" maxWidth="750px">
                <Subheader mb={4}>We couldn't get your repositories</Subheader>
                <Paragraph as="div">
                  We couldn't retrieve so many repositories from {glossary.providers[organization.provider].caption}.
                  Please{' '}
                  <Link to={routes.organization.repositories} params={params} size="md">
                    open the Repositories list
                  </Link>{' '}
                  and search for specific repositories instead.
                </Paragraph>
              </EmptyState>
            ) : (
              <EmptyState flexGrow={1} alignSelf="center" maxWidth="750px">
                <Subheader mb={4}>An unexpected error happened</Subheader>
                <Paragraph as="div">
                  There was a problem trying to fetch your organization information. Try again later and if the problem
                  persists, <SupportLink>contact us on support</SupportLink>.
                </Paragraph>
              </EmptyState>
            ))}
          {(loading || !error) && (
            <>
              <Flex justifyContent="space-between" alignItems="baseline" mb={6}>
                <Title display="inline-block">{organization.name}</Title>
                <ManageRepositoriesButton onClick={handleManageRepositoriesClick} />
              </Flex>

              <Flex flexDirection="row" flexGrow={1}>
                <Flex flexDirection="column" flexGrow={1}>
                  <Flex mb={4} alignItems="center">
                    <Caption as="div" color="complementary" size="md" mr={3}>
                      <IconAndText icon={FilterIcon}>Filter by</IconAndText>
                    </Caption>
                    <RepositoriesDropdown
                      initialItems={selectedRepositoriesNames || []}
                      onChange={handleRepositoriesChange}
                    />
                    {loading && <Loader width="unset" flexGrow="unset" />}
                  </Flex>
                  <OverallQuality
                    isLoading={isFirstAnalysisLoading}
                    isFetching={loading && repositoriesWithAnalysis.length === 0}
                    repositories={repositoriesWithAnalysis}
                    onSelect={handleBarSelect}
                    onFactorChange={handleFactorChange}
                    hasMoreRepositories={!selectedRepositoriesNames?.length && !isSinglePage}
                    mb={8}
                  />
                  {!isEmpty && <PullRequestWidget repositories={selectedRepositoriesNames} />}
                </Flex>

                {(tempOnboardingFlow || !isEmpty) && (
                  <Box pl={6} width={[1 / 3, '27.5rem']}>
                    {!!selectedBar && (
                      <DrillDownRepositoriesCard
                        height="30.125rem"
                        mt={8}
                        mb={8}
                        ml={-6}
                        pl={6}
                        factor={selectedFactor}
                        repositories={selectedBar.innerRepositories}
                        group={selectedBar.groupName}
                      />
                    )}

                    {tempOnboardingFlow && (
                      <OnboardingProgressBar
                        title="Organization setup"
                        steps={progressData || []}
                        description="Configure key defaults and optimize Codacy for your organization."
                        completedMessage="Configure key defaults and optimize Codacy for your organization."
                        track={track}
                        mt={3}
                        mb={6}
                      />
                    )}

                    {!isEmpty && (
                      <>
                        {displaySuggestions && !selectedBar && (
                          <OrganizationOwnerContent>
                            <SuggestedPeoplePanel
                              height="30rem"
                              mb={8}
                              onDismiss={handleSuggestionsDismiss}
                              onLoad={handleSuggestionsLoad}
                              provider={params.provider}
                              organization={params.organization}
                              track={track}
                            />
                          </OrganizationOwnerContent>
                        )}

                        <LastUpdatedWidget
                          limit={displaySuggestions || !!selectedBar ? 7 : 14}
                          isFetching={loading && repositoriesWithAnalysis.length === 0}
                          repositories={repositoriesWithAnalysis}
                        />
                      </>
                    )}
                  </Box>
                )}
              </Flex>
            </>
          )}
          {followAnnouncementModal && (
            <FollowAnnouncementModal
              onClick={handleManageRepositoriesClick}
              onHideModal={() => setFollowAnnouncementModal(false)}
            />
          )}
          <Route path={routes.organization.dashboard.add.path}>
            <Page title="Manage repositories" category="organization.dashboard.add">
              <ManageRepositoriesModal
                modalProps={manageRepositoryModalProps}
                onLoad={() => setFollowAnnouncementModal(false)}
                onClose={handleManageRepositoriesClose}
              />
            </Page>
          </Route>
        </Flex>
      )}
    </Page>
  )
}

export default TeamDashboard
